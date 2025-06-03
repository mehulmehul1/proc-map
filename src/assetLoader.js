// assetLoader.js
import * as THREE from 'https://cdn.skypack.dev/three@0.137';
import { RGBELoader } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/loaders/RGBELoader';
import { TextureLoader } from 'https://cdn.skypack.dev/three@0.137';

export async function loadAssets(pmrem) {
    const envmapTexture = await new RGBELoader().loadAsync("assets/envmap.hdr");
    const rt = pmrem.fromEquirectangular(envmapTexture);
    const envmap = rt.texture;

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