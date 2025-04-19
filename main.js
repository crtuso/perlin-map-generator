// js/main.js

const TILE_SIZE = 128;
const MAP_WIDTH = 20;
const MAP_HEIGHT = 15;

let currentSeed = Math.random();
let noiseScale = 0.1;

const BIOME_IDX = {
    water: 203,
    grass: 23,
    rock: 28,
    snow: 86,
    sand: 18,
    dirt: 91,
};

const TRANSITION_IDX = {
    grass: { 1: 6, 2: 24, 4: 40, 8: 22, 3: 7, 6: 41, 12: 39, 9: 5, innerNW: 26, innerNE: 25, innerSE: 8, innerSW: 9 },
    rock: { 1: 11, 2: 29, 4: 45, 8: 27, 3: 12, 6: 46, 12: 44, 9: 10, innerNW: 31, innerNE: 30, innerSE: 13, innerSW: 14 },
    snow: { 1: 69, 2: 87, 4: 103, 8: 85, 3: 70, 6: 104, 12: 102, 9: 68, innerNW: 89, innerNE: 88, innerSE: 71, innerSW: 72 },
    sand: { 1: 1, 2: 19, 4: 35, 8: 17, 3: 2, 6: 36, 12: 34, 9: 0, innerNW: 21, innerNE: 20, innerSE: 3, innerSW: 4 },
    dirt: { 1: 74, 2: 92, 4: 108, 8: 90, 3: 75, 6: 109, 12: 107, 9: 73, innerNW: 94, innerNE: 93, innerSE: 76, innerSW: 77 },
};

const DECOR_IDX = {
    sand: [{ idx: 37, chance: 0.03 }, { idx: 38, chance: 0.01 }, { idx: 54, chance: 0.01 }, { idx: 55, chance: 0.005 }],
    grass: [{ idx: 42, chance: 0.03 }, { idx: 43, chance: 0.01 }, { idx: 59, chance: 0.01 }, { idx: 60, chance: 0.01 }],
    rock: [{ idx: 47, chance: 0.03 }, { idx: 48, chance: 0.01 }, { idx: 64, chance: 0.005 }, { idx: 65, chance: 0.01 }],
    snow: [{ idx: 105, chance: 0.005 }, { idx: 106, chance: 0.06 }, { idx: 122, chance: 0.01 }, { idx: 123, chance: 0.01 }],
    dirt: [{ idx: 110, chance: 0.005 }, { idx: 111, chance: 0.01 }, { idx: 127, chance: 0.005 }, { idx: 128, chance: 0.01 }],
};

const ROAD_IDX = {
    straight: 142,
    corner: 138,
    end: 145
};

class MapScene extends Phaser.Scene {
    constructor() {
        super("MapScene");
    }

    preload() {
        this.load.spritesheet(
            "tiles",
            "assets/Tilesheet/mapPack_tilesheet_2X.png",
            { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE }
        );
    }

    create() {
        noise.seed(currentSeed);

        this.decorGroup = this.add.group();

        this.biomes = Array.from({ length: MAP_HEIGHT },
            () => new Array(MAP_WIDTH)
        );

        this.generateMap();

        this.player = this.add.sprite(
            (MAP_WIDTH / 2) * TILE_SIZE + TILE_SIZE / 2,
            (MAP_HEIGHT / 2) * TILE_SIZE + TILE_SIZE / 2,
            "tiles", 168
        ).setDepth(10);

        this.cursors = this.input.keyboard.createCursorKeys();

        this.input.keyboard.on("keydown-R", () => {
            currentSeed = Math.random();
            noise.seed(currentSeed);
            this.generateMap();
        });
        this.input.keyboard.on("keydown-COMMA", () => {
            noiseScale = Math.max(0.02, noiseScale * 0.9);
            this.generateMap(false);
        });
        this.input.keyboard.on("keydown-PERIOD", () => {
            noiseScale *= 1.1;
            this.generateMap(false);
        });
    }

    update() {
        const step = TILE_SIZE;
        if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) this.player.x -= step;
        if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) this.player.x += step;
        if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) this.player.y -= step;
        if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) this.player.y += step;
    }

    generateMap(newSeed = true) {
        // clear old layers & decals
        if (this.waterLayer) this.waterLayer.destroy();
        if (this.groundLayer) this.groundLayer.destroy();
        this.decorGroup.clear(true, true);

        const map = this.make.tilemap({
            width: MAP_WIDTH,
            height: MAP_HEIGHT,
            tileWidth: TILE_SIZE,
            tileHeight: TILE_SIZE,
        });
        const tileset = map.addTilesetImage("tiles", null, TILE_SIZE, TILE_SIZE);

        // 0) WATER BACKGROUND LAYER (never overwritten)
        this.waterLayer = map.createBlankLayer("water", tileset, 0, 0);
        this.waterLayer.fill(BIOME_IDX.water, 0, 0, MAP_WIDTH, MAP_HEIGHT);

        // 1) GROUND LAYER — biomes & transitions go here
        this.groundLayer = map.createBlankLayer("ground", tileset, 0, 0);

        // 1a) Base interiors, but **skip** real water so bg shows through
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const n = noise.perlin2(x * noiseScale, y * noiseScale);
                let biome;
                if (n < -0.4) biome = "water";
                else if (n < -0.2) biome = "sand";
                else if (n < 0.2) biome = "grass";
                else if (n < 0.5) biome = "rock";
                else if (n < 0.7) biome = "dirt";
                else biome = "snow";

                this.biomes[y][x] = biome;
                if (biome !== "water") {
                    this.groundLayer.putTileAt(BIOME_IDX[biome], x, y);
                }
            }
        }

        // 1b) Iteratively prune one‑tile spurs so corners always have room
        let removed;
        do {
            removed = 0;
            for (let y = 0; y < MAP_HEIGHT; y++) {
                for (let x = 0; x < MAP_WIDTH; x++) {
                    const b = this.biomes[y][x];
                    if (b === "water") continue;

                    let count = 0;
                    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => {
                        const yy = y + dy, xx = x + dx;
                        if (
                            yy >= 0 && yy < MAP_HEIGHT &&
                            xx >= 0 && xx < MAP_WIDTH &&
                            this.biomes[yy][xx] === b
                        ) count++;
                    });

                    if (count <= 1) {
                        this.biomes[y][x] = "water";
                        this.groundLayer.putTileAt(BIOME_IDX.water, x, y);
                        removed++;
                    }
                }
            }
        } while (removed > 0);

        // 2) TRANSITIONS (outer edges + inner corners)
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const b = this.biomes[y][x];
                const tbl = TRANSITION_IDX[b];
                if (!tbl) continue;

                let mask = 0;
                if (this.biomes[y - 1]?.[x] !== b) mask |= 1; // N
                if (this.biomes[y]?.[x + 1] !== b) mask |= 2; // E
                if (this.biomes[y + 1]?.[x] !== b) mask |= 4; // S
                if (this.biomes[y]?.[x - 1] !== b) mask |= 8; // W

                if (mask === 0) {
                    if (
                        this.biomes[y - 1]?.[x] === b &&
                        this.biomes[y]?.[x - 1] === b &&
                        this.biomes[y - 1]?.[x - 1] !== b
                    ) { this.groundLayer.putTileAt(tbl.innerNW, x, y); continue; }
                    if (
                        this.biomes[y - 1]?.[x] === b &&
                        this.biomes[y]?.[x + 1] === b &&
                        this.biomes[y - 1]?.[x + 1] !== b
                    ) { this.groundLayer.putTileAt(tbl.innerNE, x, y); continue; }
                    if (
                        this.biomes[y + 1]?.[x] === b &&
                        this.biomes[y]?.[x + 1] === b &&
                        this.biomes[y + 1]?.[x + 1] !== b
                    ) { this.groundLayer.putTileAt(tbl.innerSE, x, y); continue; }
                    if (
                        this.biomes[y + 1]?.[x] === b &&
                        this.biomes[y]?.[x - 1] === b &&
                        this.biomes[y + 1]?.[x - 1] !== b
                    ) { this.groundLayer.putTileAt(tbl.innerSW, x, y); continue; }
                }

                const t = tbl[mask];
                if (t != null) this.groundLayer.putTileAt(t, x, y);
            }
        }

        // 3) décor as sprites
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const list = DECOR_IDX[this.biomes[y][x]];
                if (!list) continue;
                list.forEach(({ idx, chance }) => {
                    if (Math.random() < chance) {
                        const px = x * TILE_SIZE + TILE_SIZE / 2;
                        const py = y * TILE_SIZE + TILE_SIZE / 2;
                        this.decorGroup.add(
                            this.add.image(px, py, "tiles", idx).setDepth(5)
                        );
                    }
                });
            }
        }
    }
}

const config = {
    type: Phaser.AUTO,
    width: MAP_WIDTH * TILE_SIZE,
    height: MAP_HEIGHT * TILE_SIZE,
    backgroundColor: "#222",
    scene: [MapScene],
};

window.addEventListener("load", () => new Phaser.Game(config));
