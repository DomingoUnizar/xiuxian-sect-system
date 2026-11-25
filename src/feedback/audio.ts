/**
 * 多曲目古韵音乐与实景音效引擎
 * - 全部音频严格 `preload = 'none'`，首屏零流量开销；
 * - 从《修仙素材/音乐素材》精选 4 首 CC0 空灵循环曲并支持顺次切曲与静音；
 * - 切后台自动暂停，回归自动恢复。
 */
import { assetUrl } from '../ui/assetUrl';

export type SfxKind = 'ding' | 'alchemy' | 'sword';

export interface BgmTrack {
  id: string;
  label: string;
  file: string;
}

export const BGM_TRACKS: BgmTrack[] = [
  { id: 'reverence', label: '山门清音', file: 'assets/audio/bgm_sect_reverence.ogg' },
  { id: 'jade_spring', label: '灵泉静修', file: 'assets/audio/bgm_jade_spring.ogg' },
  { id: 'cloud_sea', label: '云海观道', file: 'assets/audio/bgm_cloud_sea.ogg' },
  { id: 'ancient_pass', label: '古道试锋', file: 'assets/audio/bgm_ancient_pass.ogg' },
];

class SectAudioEngine {
  private sfxMuted = false;
  private bgmEnabled = false;
  private trackIndex = 0;
  private bgmEl: HTMLAudioElement | null = null;
  private sfxCache = new Map<SfxKind, HTMLAudioElement>();
  private fallbackCtx: AudioContext | null = null;

  setSfxMuted(value: boolean) {
    this.sfxMuted = value;
  }

  isSfxMuted(): boolean {
    return this.sfxMuted;
  }

  isBgmEnabled(): boolean {
    return this.bgmEnabled;
  }

  getCurrentTrack(): BgmTrack {
    return BGM_TRACKS[this.trackIndex] ?? BGM_TRACKS[0];
  }

  private getSfxPath(kind: SfxKind): string {
    if (kind === 'alchemy') return assetUrl('assets/audio/sfx_alchemy_done.ogg');
    if (kind === 'sword') return assetUrl('assets/audio/sfx_sword_clash.ogg');
    return assetUrl('assets/audio/sfx_system_ding.ogg');
  }

  private loadTrack(autoPlay: boolean) {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    const track = this.getCurrentTrack();
    if (this.bgmEl) {
      this.bgmEl.pause();
    }
    this.bgmEl = new Audio(assetUrl(track.file));
    this.bgmEl.loop = true;
    this.bgmEl.volume = 0.26;
    this.bgmEl.preload = 'none';
    if (autoPlay) {
      void this.bgmEl.play().catch(() => {
        // 无头环境或未获手势时静默忽略
      });
    }
  }

  toggleBgm(): boolean {
    this.bgmEnabled = !this.bgmEnabled;
    if (typeof window === 'undefined' || typeof Audio === 'undefined') {
      return this.bgmEnabled;
    }
    if (this.bgmEnabled) {
      if (!this.bgmEl) {
        this.loadTrack(true);
      } else {
        void this.bgmEl.play().catch(() => {});
      }
    } else if (this.bgmEl) {
      this.bgmEl.pause();
    }
    return this.bgmEnabled;
  }

  nextTrack(): BgmTrack {
    this.trackIndex = (this.trackIndex + 1) % BGM_TRACKS.length;
    if (this.bgmEnabled) {
      this.loadTrack(true);
    } else if (this.bgmEl) {
      this.bgmEl.pause();
      this.bgmEl = null;
    }
    return this.getCurrentTrack();
  }

  handleVisibility(hidden: boolean) {
    if (!this.bgmEl || !this.bgmEnabled) return;
    if (hidden) {
      this.bgmEl.pause();
    } else {
      void this.bgmEl.play().catch(() => {});
    }
  }

  unlock() {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx && !this.fallbackCtx) {
      try {
        this.fallbackCtx = new AudioCtx();
      } catch {
        this.fallbackCtx = null;
      }
    }
    if (this.fallbackCtx && this.fallbackCtx.state === 'suspended') {
      void this.fallbackCtx.resume().catch(() => {});
    }
    if (this.bgmEnabled && this.bgmEl && this.bgmEl.paused) {
      void this.bgmEl.play().catch(() => {});
    }
  }

  playSfx(kind: SfxKind) {
    if (this.sfxMuted || typeof window === 'undefined') return;
    this.unlock();

    if (typeof Audio !== 'undefined') {
      try {
        let base = this.sfxCache.get(kind);
        if (!base) {
          base = new Audio(this.getSfxPath(kind));
          base.volume = kind === 'ding' ? 0.45 : 0.4;
          base.preload = 'none';
          this.sfxCache.set(kind, base);
        }
        const clone = base.cloneNode(true) as HTMLAudioElement;
        clone.volume = base.volume;
        void clone.play().catch(() => {
          this.playFallbackTone(kind);
        });
        return;
      } catch {
        // 回退至 Web Audio
      }
    }
    this.playFallbackTone(kind);
  }

  playDing(tier: 'notable' | 'major' = 'major') {
    if (tier === 'major' || tier === 'notable') {
      this.playSfx('ding');
    }
  }

  /**
   * 破境、暴击返还、大捷与神迹降临的五声音阶上行仙乐和弦（零网络开销）
   */
  playFanfare() {
    if (this.sfxMuted || typeof window === 'undefined') return;
    this.unlock();
    if (!this.fallbackCtx || this.fallbackCtx.state !== 'running') {
      this.playSfx('ding');
      return;
    }
    try {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const base = this.fallbackCtx.currentTime;
      notes.forEach((freq, idx) => {
        if (!this.fallbackCtx) return;
        const start = base + idx * 0.065;
        const gain = this.fallbackCtx.createGain();
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.085, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
        gain.connect(this.fallbackCtx.destination);
        const osc = this.fallbackCtx.createOscillator();
        osc.type = idx === notes.length - 1 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, start);
        osc.connect(gain);
        osc.start(start);
        osc.stop(start + 0.44);
      });
    } catch {
      this.playSfx('ding');
    }
  }

  private playFallbackTone(kind: SfxKind) {
    if (!this.fallbackCtx || this.fallbackCtx.state !== 'running') return;
    try {
      const now = this.fallbackCtx.currentTime;
      const gain = this.fallbackCtx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.11, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
      gain.connect(this.fallbackCtx.destination);
      const osc = this.fallbackCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(kind === 'sword' ? 660 : kind === 'alchemy' ? 880 : 1318.5, now);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.38);
    } catch {
      // ignore
    }
  }
}

export const jadeChime = new SectAudioEngine();
