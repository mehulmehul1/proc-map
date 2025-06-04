// assetLoader.js
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { TextureLoader } from 'three';

export async function loadAssets(pmrem: { fromEquirectangular: (arg0: THREE.DataTexture) => any; }) {
    const envmapTexture: THREE.DataTexture = await new RGBELoader().loadAsync("assets/envmap.hdr");
    const rt: THREE.WebGLRenderTarget = pmrem.fromEquirectangular(envmapTexture);
    const envmap: THREE.Texture = rt.texture;

    const textures = {
        dirt: await new TextureLoader().loadAsync("assets/dirt.png"),
        dirt2: await new TextureLoader().loadAsync("assets/dirt2.jpg"),
        grass: [ // Keep as array for variation
            await new TextureLoader().loadAsync("assets/grass1-albedo3.png"),
            await new TextureLoader().loadAsync("assets/grass.jpg")
        ],
        grassNormal: await new TextureLoader().loadAsync("assets/grass1-normal1-dx.png"),
        sand: await new TextureLoader().loadAsync("assets/sand.jpg"),
        water: await new TextureLoader().loadAsync("assets/water.jpg"),
        stone: await new TextureLoader().loadAsync("assets/stone.png"),
    };

    const mapDataResponse = await fetch("assets/gettysburg_map_data.json");
    const loadedMapData = await mapDataResponse.json();

    return { envmap, textures, loadedMapData };
}