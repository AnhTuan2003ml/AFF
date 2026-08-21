#!/usr/bin/env python3
"""
Sinh bộ ảnh nhận diện cho app từ HAI nguồn duy nhất: logo ShopTik
(assets/images/brand-logo.png) và linh vật CamiO (assets/images/mascot/*.png).

Vì sao cần script: mỗi nơi Android/iOS hiển thị logo lại đòi một kích cỡ và
một "luật" riêng — icon thích ứng chỉ hiện vùng tròn giữa ~66% nên logo vẽ tràn
khung sẽ bị phóng to, cắt mất quai túi; icon iOS không được có kênh trong suốt;
icon nhỏ trên thanh trạng thái bắt buộc đơn sắc trắng trên nền trong suốt; ảnh
lớn của thông báo cần bitmap đúng mật độ điểm ảnh. Sửa tay từng file rất dễ
lệch — sửa nguồn rồi chạy lại `npm run brand-assets` là cả bộ đồng bộ.

Cần Pillow:  pip install pillow
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "assets" / "images"
LOGO = ROOT / "brand-logo.png"
MASCOT = ROOT / "mascot" / "camio-vuive.png"
BRAND_SOFT = (255, 240, 234, 255)  # nền nhạt tông cam thương hiệu
BRAND_LINE = (255, 205, 186, 255)


def logo_trimmed() -> Image.Image:
    im = Image.open(LOGO).convert("RGBA")
    return im.crop(im.getbbox())


def fit_center(src: Image.Image, canvas: int, box: int, bg=(0, 0, 0, 0)) -> Image.Image:
    """Co `src` lọt trong hình vuông cạnh `box` rồi đặt giữa khung `canvas`."""
    w, h = src.size
    k = box / max(w, h)
    resized = src.resize((round(w * k), round(h * k)), Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), bg)
    out.paste(resized, ((canvas - resized.width) // 2, (canvas - resized.height) // 2), resized)
    return out


def silhouette(src: Image.Image) -> Image.Image:
    """Đơn sắc trắng: phần màu của logo → trắng, phần trắng (vòng xoáy) → trong suốt
    để vẫn nhận ra hình túi + xoáy chứ không thành một khối đặc."""
    px = src.load()
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    op = out.load()
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            whiteness = min(r, g, b) / 255
            keep = max(0.0, min(1.0, (0.85 - whiteness) / 0.35))
            op[x, y] = (255, 255, 255, round(a * keep))
    return out


def mascot_badge(size: int) -> Image.Image:
    """Linh vật trên đĩa tròn màu nền thương hiệu — ảnh lớn của thông báo."""
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    d.ellipse((0, 0, size - 1, size - 1), fill=BRAND_SOFT, outline=BRAND_LINE, width=max(2, size // 96))
    m = Image.open(MASCOT).convert("RGBA")
    m = m.crop(m.getbbox())
    badge = fit_center(m, size, round(size * 0.78))
    out.alpha_composite(badge)
    return out


def main() -> None:
    logo = logo_trimmed()
    mono = silhouette(logo)
    outputs = {
        # Lớp trên của icon thích ứng Android: logo chiếm ~58% khung → nằm trọn
        # trong vùng an toàn (66%), launcher bo tròn/vuông đều còn nguyên quai túi.
        "brand-logo-adaptive.png": fit_center(logo, 1024, 600),
        "brand-logo-monochrome.png": fit_center(mono, 1024, 600),
        # Icon chính (iOS/cửa hàng/legacy): đặc, nền trắng, logo 78%.
        "app-icon.png": fit_center(logo, 1024, 800, (255, 255, 255, 255)),
        # Icon nhỏ trên thanh trạng thái: trắng trên nền trong suốt, 96px (xxxhdpi).
        "notification-icon.png": fit_center(mono, 96, 84),
        # Ảnh lớn của mọi thông báo: linh vật CamiO, 384px = 96dp @xxxhdpi.
        "notification-large-icon.png": mascot_badge(384),
    }
    for name, im in outputs.items():
        im.save(ROOT / name, optimize=True)
        print(f"{name:34} {im.width}x{im.height}")


if __name__ == "__main__":
    main()
