import zlib
import struct
import math
import os

def write_png(filename, width, height, pixels):
    """
    pixels is a list of rows, each row is a list of (r, g, b, a) tuples.
    """
    raw_bytes = bytearray()
    for row in pixels:
        raw_bytes.append(0)  # Filter type 0 (None)
        for r, g, b, a in row:
            raw_bytes.extend((r, g, b, a))
    
    compressed = zlib.compress(bytes(raw_bytes), 9)
    
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    
    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    png.extend(struct.pack('>I', len(ihdr_data)))
    png.extend(b'IHDR')
    png.extend(ihdr_data)
    png.extend(struct.pack('>I', ihdr_crc))
    
    # IDAT
    idat_crc = zlib.crc32(b'IDAT' + compressed)
    png.extend(struct.pack('>I', len(compressed)))
    png.extend(b'IDAT')
    png.extend(compressed)
    png.extend(struct.pack('>I', idat_crc))
    
    # IEND
    iend_crc = zlib.crc32(b'IEND')
    png.extend(struct.pack('>I', 0))
    png.extend(b'IEND')
    png.extend(struct.pack('>I', iend_crc))
    
    with open(filename, 'wb') as f:
        f.write(png)

def render_shopcart_icon(size, is_maskable=False):
    pixels = []
    
    # Colors
    bg_top = (11, 92, 55, 255)       # #0b5c37
    bg_bottom = (4, 44, 24, 255)     # #042c18
    white = (255, 255, 255, 255)
    emerald = (16, 185, 129, 255)    # #10b981
    gold = (245, 158, 11, 255)       # #f59e0b
    
    center_x = size / 2.0
    center_y = size / 2.0
    
    # Scale factor
    scale = size / 512.0
    if is_maskable:
        # 15% safe margin on all sides -> scale down contents
        scale *= 0.78
        
    corner_radius = 110.0 * scale
    
    for y in range(size):
        row = []
        # Gradient background
        t = y / float(size)
        bg_r = int(bg_top[0] + t * (bg_bottom[0] - bg_top[0]))
        bg_g = int(bg_top[1] + t * (bg_bottom[1] - bg_top[1]))
        bg_b = int(bg_top[2] + t * (bg_bottom[2] - bg_top[2]))
        
        for x in range(size):
            if is_maskable:
                # Maskable icon should have full bleed background
                color = (bg_r, bg_g, bg_b, 255)
            else:
                # Rounded squircle for standard icon
                dx = abs(x - center_x)
                dy = abs(y - center_y)
                half = size / 2.0
                
                # Check rounded rect
                rad = 90.0 * (size / 512.0)
                in_rect = False
                if dx <= half - rad and dy <= half:
                    in_rect = True
                elif dy <= half - rad and dx <= half:
                    in_rect = True
                else:
                    cx_corner = half - rad
                    cy_corner = half - rad
                    dist_sq = (dx - cx_corner)**2 + (dy - cy_corner)**2
                    if dist_sq <= rad**2:
                        in_rect = True
                        
                if in_rect:
                    color = (bg_r, bg_g, bg_b, 255)
                else:
                    color = (0, 0, 0, 0)
            
            # Draw Cart and Bag silhouette onto center
            # Normalized coordinates relative to center
            nx = (x - center_x) / scale
            ny = (y - center_y) / scale
            
            # Shopping bag: rect [-45, -70] to [45, 20]
            if color[3] > 0:
                # Bag Handle
                handle_dist = ((nx)**2 + (ny + 70)**2)**0.5
                if 28 <= handle_dist <= 42 and ny + 70 < 0:
                    color = gold
                
                # Bag Body
                if -45 <= nx <= 45 and -60 <= ny <= 20:
                    # Inner star or accent
                    star_dist = ((nx)**2 + (ny + 20)**2)**0.5
                    if star_dist <= 12:
                        color = gold
                    else:
                        color = emerald
                
                # Cart Basket lines
                # Basket rim: y = -45, x from -90 to 80
                # Handle: x from -120 to -90, y around -60 to -45
                in_cart_frame = False
                
                # Handle bar
                if -120 <= nx <= -90 and abs(ny - (-60 + (nx - -120)*0.5)) <= 8:
                    in_cart_frame = True
                
                # Cart bottom line: y = 45, x from -60 to 70
                if abs(ny - 45) <= 8 and -65 <= nx <= 75:
                    in_cart_frame = True
                    
                # Cart back line: from (-90, -45) to (-60, 45)
                if -90 <= nx <= -60:
                    expected_y = -45 + (nx - -90) * (90.0 / 30.0)
                    if abs(ny - expected_y) <= 8:
                        in_cart_frame = True
                        
                # Cart front line: from (70, 45) to (95, -45)
                if 70 <= nx <= 95:
                    expected_y = 45 - (nx - 70) * (90.0 / 25.0)
                    if abs(ny - expected_y) <= 8:
                        in_cart_frame = True
                        
                # Cart horizontal grid
                if abs(ny - 0) <= 5 and -75 <= nx <= 85:
                    in_cart_frame = True
                    
                if in_cart_frame:
                    color = white
                    
                # Wheels
                # Left wheel center: (-45, 85)
                # Right wheel center: (55, 85)
                w1_dist = ((nx - -45)**2 + (ny - 85)**2)**0.5
                w2_dist = ((nx - 55)**2 + (ny - 85)**2)**0.5
                
                if w1_dist <= 18:
                    color = white if w1_dist >= 8 else bg_top
                elif w2_dist <= 18:
                    color = white if w2_dist >= 8 else bg_top
            
            row.append(color)
        pixels.append(row)
        
    return pixels

os.makedirs('public', exist_ok=True)
print("Rendering pwa-192x192.png...")
write_png('public/pwa-192x192.png', 192, 192, render_shopcart_icon(192, False))

print("Rendering pwa-512x512.png...")
write_png('public/pwa-512x512.png', 512, 512, render_shopcart_icon(512, False))

print("Rendering pwa-maskable-512x512.png...")
write_png('public/pwa-maskable-512x512.png', 512, 512, render_shopcart_icon(512, True))

print("Rendering apple-touch-icon.png...")
write_png('public/apple-touch-icon.png', 180, 180, render_shopcart_icon(180, False))

print("Rendering favicon.png (for favicon.ico)...")
write_png('public/favicon-32x32.png', 32, 32, render_shopcart_icon(32, False))
# Copy as favicon.ico (modern browsers accept PNG format favicon directly)
import shutil
shutil.copyfile('public/favicon-32x32.png', 'public/favicon.ico')

print("All PWA icons generated successfully!")
