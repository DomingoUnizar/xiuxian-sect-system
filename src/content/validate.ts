import Ajv from 'ajv';
import { SYSTEM_FORBIDDEN_PUBLIC_TERMS } from '../sim/constants';
import rawActionReports from './action_reports_pool.json';
import rawActivityBubbles from './activity_bubbles.json';
import rawAssets from './asset-manifest.json';
import rawCandidates from './candidates_pool.json';
import rawCompendium from './compendium_lore.json';
import rawContent from './content.json';
import contentSchema from './content.schema.json';
import rawMapBubbles from './map_bubbles.json';
import rawMissionsExt from './mission_templates_ext.json';
import rawReturnOpenings from './return_openings.json';

export type GameContent = typeof rawContent;
export interface AssetManifestEntry {
  id: string;
  variantOf: string | null;
  sourcePack: string;
  relativePath: string;
  sha256: string;
  format: string;
  bytes: number;
  licenseRef: string;
  credit: string;
  useScope: string;
}

export const CONTENT: GameContent = rawContent;
export const ASSET_MANIFEST: AssetManifestEntry[] = rawAssets.assets;

export interface ContentValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateContentIntegrity(content: GameContent = CONTENT): ContentValidationResult {
  const ajv = new Ajv({ allErrors: true });
  const validateSchema = ajv.compile(contentSchema);
  const schemaOk = validateSchema(content);
  const errors: string[] = [];

  if (!schemaOk && validateSchema.errors) {
    for (const err of validateSchema.errors) {
      errors.push(`Schema error at ${err.instancePath || '/'}: ${err.message}`);
    }
  }

  const itemIds = new Set(content.items.map((item) => item.id));
  const methodIds = new Set(content.methods.map((m) => m.id));
  const permissionKeys = new Set(content.systemThresholds.map((t) => t.key));

  for (const recipe of content.recipes) {
    for (const herbId of Object.keys(recipe.inputs)) {
      if (!itemIds.has(herbId)) {
        errors.push(`Recipe ${recipe.id} references missing input item ${herbId}`);
      }
    }
    if (!itemIds.has(recipe.outputLowId)) {
      errors.push(`Recipe ${recipe.id} references missing outputLowId ${recipe.outputLowId}`);
    }
    if (!itemIds.has(recipe.outputMidId)) {
      errors.push(`Recipe ${recipe.id} references missing outputMidId ${recipe.outputMidId}`);
    }
    if (recipe.requiresMethodId && !methodIds.has(recipe.requiresMethodId)) {
      errors.push(`Recipe ${recipe.id} references missing method ${recipe.requiresMethodId}`);
    }
  }

  for (const heritage of content.heritages) {
    if (!methodIds.has(heritage.methodId)) {
      errors.push(`Heritage ${heritage.key} references missing method ${heritage.methodId}`);
    }
    if (!permissionKeys.has(heritage.unlocksPermission)) {
      errors.push(`Heritage ${heritage.key} references missing permission ${heritage.unlocksPermission}`);
    }
  }

  // 检查世界观红线：内容文中不允许混入《云岚宗》
  const serialized = JSON.stringify(content);
  if (serialized.includes('云岚宗')) {
    errors.push('Content violates project rule: forbidden sect name 云岚宗 detected');
  }

  // 扫描全量叙事文本池的公开字段，确保单盲隔离与世界观红线零违反
  const forbiddenPublicWords = [...SYSTEM_FORBIDDEN_PUBLIC_TERMS, '绑定', '任务面板', '金手指', '云岚宗', '云岗宗'];
  const publicFieldKeys = new Set([
    'publicBubble',
    'publicSummary',
    'background',
    'personalGoal',
    'auditionLine',
    'acceptLine',
    'declineLine',
    'lore',
    'shortReport',
    'opening',
  ]);
  const narrativePacks: Array<[string, unknown]> = [
    ['map_bubbles.json', rawMapBubbles],
    ['activity_bubbles.json', rawActivityBubbles],
    ['candidates_pool.json', rawCandidates],
    ['mission_templates_ext.json', rawMissionsExt],
    ['compendium_lore.json', rawCompendium],
    ['action_reports_pool.json', rawActionReports],
    ['return_openings.json', rawReturnOpenings],
  ];

  const scanNode = (node: unknown, label: string, currentPath: string) => {
    if (typeof node === 'string') {
      const key = currentPath.split('.').pop()?.replace(/\[\d+\]/g, '') ?? '';
      if (publicFieldKeys.has(key)) {
        for (const bad of forbiddenPublicWords) {
          if (node.includes(bad)) {
            errors.push(`${label} -> ${currentPath}: public field contains forbidden term "${bad}"`);
          }
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, idx) => scanNode(item, label, `${currentPath}[${idx}]`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        scanNode(v, label, currentPath ? `${currentPath}.${k}` : k);
      }
    }
  };

  for (const [label, pack] of narrativePacks) {
    scanNode(pack, label, '');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getMethodById(methodId: string) {
  return CONTENT.methods.find((m) => m.id === methodId);
}

export function getItemById(itemId: string) {
  return CONTENT.items.find((i) => i.id === itemId);
}

export function getRecipeById(recipeId: string) {
  return CONTENT.recipes.find((r) => r.id === recipeId);
}

export function getRegionById(regionId: string) {
  return CONTENT.regions.find((r) => r.id === regionId);
}
