"""
Erase text regions from slide images so they can be used as backgrounds
with editable text overlaid in PowerPoint.
"""
from PIL import Image, ImageDraw

def sample_color(img, x, y, radius=3):
    """Sample average color from a small area around (x,y)."""
    pixels = []
    for dx in range(-radius, radius+1):
        for dy in range(-radius, radius+1):
            px, py = x+dx, y+dy
            if 0 <= px < img.width and 0 <= py < img.height:
                pixels.append(img.getpixel((px, py)))
    r = sum(p[0] for p in pixels) // len(pixels)
    g = sum(p[1] for p in pixels) // len(pixels)
    b = sum(p[2] for p in pixels) // len(pixels)
    return (r, g, b)

def fill_region(img, draw, region, color=None, sample_pos=None):
    """Fill a rectangular region with a solid color."""
    x1, y1, x2, y2 = region
    if color is None and sample_pos:
        color = sample_color(img, *sample_pos)
    draw.rectangle([x1, y1, x2, y2], fill=color)

base = "business_modules/radio/input/slides_extracted"

# ===== SLIDE 1 =====
img1 = Image.open(f"{base}/slide_01.png")
draw1 = ImageDraw.Draw(img1)

# Sample the dark blue background color from a safe spot (top-left area, no circuit patterns)
dark_blue = sample_color(img1, 50, 50, radius=5)

# Date badge "05/04/2026" - white rounded rect area
# The white badge is roughly at x=530-840, y=18-72
fill_region(img1, draw1, (530, 18, 840, 72), color=(255, 255, 255))

# "תוכנית עבודה מבצעית" - right side text on dark blue
# roughly x=640, y=85, to x=1340, y=148
fill_region(img1, draw1, (640, 85, 1340, 148), color=dark_blue)

# Main title "סקר תמונת מצב והתנהגות / אוכלוסייה: קריית שמונה"
# roughly x=90, y=155, to x=1330, y=345
fill_region(img1, draw1, (90, 155, 1330, 345), color=dark_blue)

# Goal box text "מטרת העל: חיזוק תחושת / מסוגלות וחוסן העיר והתושבים."
# The white box is roughly x=270, y=390, to x=1105, y=545
# Keep the box border, just clear the interior text
fill_region(img1, draw1, (285, 400, 1090, 535), color=(255, 255, 255))

img1.save(f"{base}/slide_01_clean.png")
print("Saved slide_01_clean.png")

# ===== SLIDE 2 =====
img2 = Image.open(f"{base}/slide_02.png")
draw2 = ImageDraw.Draw(img2)

# Background is light gray
light_gray = sample_color(img2, 1300, 50, radius=5)

# Title "הנחות עבודה מרכזיות: יסודות החוסן" - top right
# roughly x=730, y=15, to x=1360, y=120
fill_region(img2, draw2, (730, 15, 1360, 120), color=light_gray)

# Block 1 (bottom dark blue): "1. הרשות המקומית / קריית שמונה- לבנת יסוד"
# roughly x=210, y=500, to x=760, y=615
dark_blue_2 = sample_color(img2, 220, 560, radius=3)
fill_region(img2, draw2, (220, 505, 750, 610), color=dark_blue_2)

# Block 2 (right teal): "2. פקע"ר (מחוז צפון)- ..."
# roughly x=870, y=350, to x=1340, y=530
teal = sample_color(img2, 880, 500, radius=3)
fill_region(img2, draw2, (875, 350, 1335, 530), color=teal)

# Block 3 (top gray/white block): "3. חוסן התושבים ..."
# roughly x=420, y=215, to x=870, y=370
block3_color = sample_color(img2, 430, 350, radius=3)
fill_region(img2, draw2, (425, 220, 865, 365), color=block3_color)

# Block 4 (middle blue): "4. התמודדות עם מורכבות ..."
# roughly x=270, y=375, to x=820, y=495
block4_color = sample_color(img2, 280, 480, radius=3)
fill_region(img2, draw2, (275, 380, 815, 490), color=block4_color)

# Yellow circle text: "5. מסגרת זמן מבצעית: ..."
# roughly x=20, y=280, to x=260, y=450
yellow = sample_color(img2, 30, 350, radius=3)
fill_region(img2, draw2, (25, 285, 255, 445), color=yellow)

img2.save(f"{base}/slide_02_clean.png")
print("Saved slide_02_clean.png")
