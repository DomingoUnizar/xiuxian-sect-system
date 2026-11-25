import { createApp } from 'vue';
import './styles/main.css';
import App from './App.vue';
import { assetUrl } from './ui/assetUrl';

if (typeof FontFace !== 'undefined' && typeof document !== 'undefined') {
  const fontUrl = assetUrl('assets/fonts/LXGWWenKai-subset.woff2');
  const wenkai = new FontFace('LXGW WenKai', `url("${fontUrl}")`, {
    style: 'normal',
    weight: '400',
    display: 'swap',
  });
  wenkai
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
    })
    .catch(() => {
      // 回退系统楷体/宋体
    });
}

createApp(App).mount('#app');
