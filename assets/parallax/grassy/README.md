# Parallax Assets for Grassy Map

Place the following 4 PNG files in this directory:

- `static_BG1.png` - Sky layer (288×208)
- `static_BG2.png` - Clouds layer (288×208) 
- `static_BG.png` - Far mountains layer (288×208)
- `static_BG3.png` - Near mountains layer (288×208)

## Parallax Configuration

The layers are configured with the following properties:

1. **Sky (static_BG1.png)**
   - Vertical factor: 0.04 (almost static)
   - No horizontal drift

2. **Clouds (static_BG2.png)**
   - Vertical factor: 0.08
   - Horizontal drift: 6 px/sec to the left

3. **Far Mountains (static_BG.png)**
   - Vertical factor: 0.16
   - No horizontal drift

4. **Near Mountains (static_BG3.png)**
   - Vertical factor: 0.28
   - No horizontal drift

## Usage

The parallax background will automatically render when you select the "grassy" map in the game. The system handles:

- Seamless tiling (3 copies per layer for coverage)
- Vertical parallax based on camera position
- Horizontal cloud drift animation
- Proper scaling to viewport width

## Tuning Tips

- **Feel "deeper"**: Drop each vFactor by ~0.03–0.05
- **More lively sky**: Increase cloud hDrift to 10–12 px/sec
- **Pixel-art crispness**: Render at integer multiples of 288px width

