// The local player and development server share one asset directory.
import {wallpaperService} from './tools/wallpaper-service.mjs';
export default {build:{copyPublicDir:false},plugins:[{name:'local-wallpaper',
  configureServer(server){server.middlewares.use(wallpaperService());}
}]};
