from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "poster_work"
WIDTH, HEIGHT = 2160, 4032  # 30 x 56 inches at 72 DPI

HEADER_SOURCE = ROOT / "nancy1" / "Poster Enh.jpg"
HEADER_CROP_HEIGHT = 370

PNG_OUT = OUT_DIR / "oma_order_sales_management_poster_4k.png"
PDF_OUT = OUT_DIR / "oma_order_sales_management_poster_30x56in.pdf"


def font(size: int, bold: bool = False, italic: bool = False) -> ImageFont.FreeTypeFont:
    candidates = []
    if bold:
        candidates.extend(
            [
                r"C:\Windows\Fonts\arialbd.ttf",
                r"C:\Windows\Fonts\segoeuib.ttf",
                r"C:\Windows\Fonts\calibrib.ttf",
            ]
        )
    elif italic:
        candidates.extend(
            [
                r"C:\Windows\Fonts\ariali.ttf",
                r"C:\Windows\Fonts\segoeuii.ttf",
                r"C:\Windows\Fonts\calibrii.ttf",
            ]
        )
    candidates.extend(
        [
            r"C:\Windows\Fonts\arial.ttf",
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\calibri.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
    )
    for path in candidates:
        p = Path(path)
        if p.exists():
            return ImageFont.truetype(str(p), size=size)
    return ImageFont.load_default()


F = {
    "hero": font(58, bold=True),
    "hero_small": font(31, bold=True),
    "section": font(32, bold=True),
    "subsection": font(24, bold=True),
    "body": font(21),
    "body_bold": font(21, bold=True),
    "small": font(18),
    "small_bold": font(18, bold=True),
    "tiny": font(15),
    "footer": font(23, bold=True),
    "footer_small": font(20),
    "phone_title": font(18, bold=True),
    "phone_body": font(13),
    "phone_bold": font(15, bold=True),
}


COLORS = {
    "navy": "#0B1A42",
    "blue": "#0C57A1",
    "blue2": "#2F9EE8",
    "deep": "#101114",
    "panel": "#1F2024",
    "text": "#1B2636",
    "muted": "#5E6A7D",
    "light": "#F5F9FF",
    "card": "#FFFFFF",
    "line": "#1A5A98",
    "green": "#15A867",
    "orange": "#F28C1B",
    "purple": "#7A3DD8",
    "red": "#E84B5C",
    "yellow": "#F7C500",
}


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def rounded_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    fill: str,
    outline: str | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def shadowed_card(
    img: Image.Image,
    box: tuple[int, int, int, int],
    radius: int = 22,
    fill: str = "#FFFFFF",
    outline: str = "#1F5C96",
    shadow: bool = True,
) -> ImageDraw.ImageDraw:
    draw = ImageDraw.Draw(img)
    if shadow:
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(layer)
        sd.rounded_rectangle(box, radius=radius, fill=(16, 42, 67, 34))
        layer = layer.filter(ImageFilter.GaussianBlur(8))
        img.alpha_composite(layer)
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=3)
    return draw


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def wrap_text(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    line = ""
    for word in words:
        trial = word if not line else f"{line} {word}"
        if text_size(draw, trial, fnt)[0] <= max_width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    text: str,
    xy: tuple[int, int],
    fnt: ImageFont.ImageFont,
    fill: str,
    max_width: int,
    line_gap: int = 8,
    max_lines: int | None = None,
) -> int:
    x, y = xy
    lines = wrap_text(draw, text, fnt, max_width)
    if max_lines is not None:
        lines = lines[:max_lines]
    line_h = text_size(draw, "Ag", fnt)[1] + line_gap
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += line_h
    return y


def draw_bullets(
    draw: ImageDraw.ImageDraw,
    items: list[str],
    x: int,
    y: int,
    width: int,
    fnt: ImageFont.ImageFont = F["body"],
    fill: str = COLORS["text"],
    accent: str = COLORS["green"],
    gap: int = 13,
    bullet: str = "check",
) -> int:
    for item in items:
        if bullet == "check":
            draw.ellipse((x, y + 4, x + 20, y + 24), fill=accent)
            draw.line((x + 6, y + 15, x + 10, y + 20, x + 16, y + 9), fill="white", width=3)
            tx = x + 34
        else:
            draw.ellipse((x + 5, y + 11, x + 14, y + 20), fill=accent)
            tx = x + 30
        new_y = draw_wrapped(draw, item, (tx, y), fnt, fill, width - (tx - x), line_gap=6)
        y = new_y + gap
    return y


def section_pill(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    title: str,
    color: str,
    icon: str = "",
) -> int:
    pill_h = 58
    if icon:
        draw.ellipse((x, y - 12, x + 82, y + 70), fill=color, outline="#FFFFFF", width=5)
        draw.text((x + 41, y + 20), icon, font=F["section"], fill="white", anchor="mm")
        tx = x + 90
    else:
        tx = x + 24
    draw.rounded_rectangle((tx - 8, y, x + w, y + pill_h), radius=30, fill=color)
    draw.text((tx + 18, y + pill_h // 2), title, font=F["section"], fill="white", anchor="lm")
    return y + pill_h


def draw_icon_network(draw: ImageDraw.ImageDraw, cx: int, cy: int, scale: int, color: str) -> None:
    pts = [
        (cx, cy - scale),
        (cx - scale, cy),
        (cx + scale, cy),
        (cx, cy + scale),
        (cx - int(scale * 0.65), cy + int(scale * 0.8)),
        (cx + int(scale * 0.65), cy - int(scale * 0.8)),
    ]
    for a, b in [(0, 1), (0, 2), (1, 3), (2, 3), (4, 1), (5, 2)]:
        draw.line((*pts[a], *pts[b]), fill=color, width=4)
    for px, py in pts:
        draw.ellipse((px - 9, py - 9, px + 9, py + 9), fill=color)


def draw_section_card(
    img: Image.Image,
    box: tuple[int, int, int, int],
    title: str,
    accent: str,
    icon: str,
    body: str | None = None,
    bullets: list[str] | None = None,
) -> None:
    draw = shadowed_card(img, box, radius=24, fill="#FFFFFF", outline=accent)
    x1, y1, x2, y2 = box
    section_pill(draw, x1 + 28, y1 - 38, x2 - x1 - 56, title, accent, icon)
    content_y = y1 + 82
    if body:
        content_y = draw_wrapped(draw, body, (x1 + 42, content_y), F["body"], COLORS["text"], x2 - x1 - 84, line_gap=8)
    if bullets:
        draw_bullets(draw, bullets, x1 + 42, content_y, x2 - x1 - 84, F["body"], COLORS["text"], accent, gap=11)


def draw_header(img: Image.Image) -> int:
    draw = ImageDraw.Draw(img)
    header_src = Image.open(HEADER_SOURCE).convert("RGB")
    header = header_src.crop((0, 0, header_src.width, HEADER_CROP_HEIGHT))
    header = header.resize((WIDTH, 370), Image.Resampling.LANCZOS)
    img.paste(header, (0, 0))
    draw.line((0, 370, WIDTH, 370), fill="#DCE7F5", width=3)
    return 370


def draw_hero(img: Image.Image, top: int) -> int:
    draw = ImageDraw.Draw(img)
    x, y, w, h = 36, top + 16, WIDTH - 72, 430
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    for i in range(h):
        t = i / max(1, h - 1)
        r = int(10 + 8 * t)
        g = int(18 + 25 * t)
        b = int(44 + 34 * t)
        ld.line((x, y + i, x + w, y + i), fill=(r, g, b, 255), width=1)
    ld.rounded_rectangle((x, y, x + w, y + h), radius=28, outline="#0D4D8B", width=4)
    img.alpha_composite(layer)

    # Decorative grid and signal lines.
    for gx in range(x + 30, x + w, 84):
        draw.line((gx, y + 28, gx, y + h - 28), fill="#18365D", width=1)
    for gy in range(y + 40, y + h, 70):
        draw.line((x + 28, gy, x + w - 28, gy), fill="#18365D", width=1)

    draw.text((x + 72, y + 56), "REACT NATIVE", font=F["hero_small"], fill=COLORS["yellow"])
    draw_wrapped(
        draw,
        "ORDER & SALES MANAGEMENT APP",
        (x + 72, y + 98),
        F["hero"],
        "#FFFFFF",
        1160,
        line_gap=10,
        max_lines=2,
    )
    draw_wrapped(
        draw,
        "Mobile-first Create > Approve > Dispatch > Analyze workflow for field sales teams, managers, and warehouse staff.",
        (x + 75, y + 245),
        font(28),
        "#DCEAFF",
        1180,
        line_gap=10,
    )

    chips = ["Expo", "TypeScript", "Node.js API", "Google Sheets"]
    cx = x + 74
    for chip in chips:
        tw, _ = text_size(draw, chip, F["small_bold"])
        draw.rounded_rectangle((cx, y + 342, cx + tw + 48, y + 391), radius=25, fill="#17375F", outline="#5DBDFF", width=2)
        draw.text((cx + 24, y + 366), chip, font=F["small_bold"], fill="#FFFFFF", anchor="lm")
        cx += tw + 68

    # Hero visual: connected dark phone tiles.
    px = x + 1340
    for idx, (label, color, offset) in enumerate(
        [("Dashboard", "#2F9EE8", 0), ("Orders", "#15A867", 58), ("Analytics", "#F7C500", 116)]
    ):
        bx = px + idx * 170
        by = y + 74 + offset
        draw.rounded_rectangle((bx, by, bx + 150, by + 270), radius=28, fill="#16181E", outline="#424958", width=3)
        draw.rectangle((bx + 14, by + 42, bx + 136, by + 46), fill=color)
        draw.text((bx + 75, by + 75), label, font=F["tiny"], fill="#FFFFFF", anchor="mm")
        for k in range(4):
            yy = by + 108 + k * 35
            draw.rounded_rectangle((bx + 22, yy, bx + 128, yy + 20), radius=8, fill="#262932")
            draw.rectangle((bx + 28, yy + 7, bx + 48 + k * 11, yy + 13), fill=color)
    draw_icon_network(draw, x + w - 196, y + 322, 58, "#45D0FF")
    return y + h


def draw_phone_frame(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], title: str, accent: str) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = box
    draw.rounded_rectangle(box, radius=42, fill="#0E0F12", outline="#2C2E34", width=5)
    draw.rounded_rectangle((x1 + 14, y1 + 14, x2 - 14, y2 - 14), radius=34, fill="#141416")
    draw.ellipse((x1 + 34, y1 + 33, x1 + 58, y1 + 57), fill="#6B3E49")
    draw.text((x1 + 70, y1 + 34), "Manager", font=font(11, bold=True), fill="#9DA3AD")
    draw.text((x1 + 70, y1 + 52), "Alex Carter", font=font(12, bold=True), fill="#FFFFFF")
    draw.rounded_rectangle((x2 - 92, y1 + 30, x2 - 38, y1 + 66), radius=18, fill="#23242A")
    draw.text((x2 - 65, y1 + 48), "!", font=font(15, bold=True), fill=accent, anchor="mm")
    draw.text((x1 + 30, y1 + 94), title, font=F["phone_title"], fill="#FFFFFF")
    return (x1 + 30, y1 + 128, x2 - 30, y2 - 30)


def draw_dashboard_phone(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int]) -> None:
    x1, y1, x2, y2 = draw_phone_frame(draw, box, "Dashboard", COLORS["yellow"])
    draw.rounded_rectangle((x1, y1, x2, y1 + 120), radius=24, fill="#1F2024")
    draw.text((x1 + 20, y1 + 22), "SAT, MAY 2", font=font(11, bold=True), fill=COLORS["yellow"])
    draw.text((x1 + 20, y1 + 54), "Today's Revenue", font=font(13, bold=True), fill="#FFFFFF")
    draw.text((x2 - 20, y1 + 54), "Rs 0", font=font(13, bold=True), fill="#FFFFFF", anchor="ra")
    draw.text((x1 + 20, y1 + 88), "Orders Processing", font=font(11, bold=True), fill=COLORS["blue2"])
    draw.text((x2 - 20, y1 + 88), "6", font=font(11, bold=True), fill=COLORS["blue2"], anchor="ra")
    yy = y1 + 142
    for name, amt, c in [
        ("Flipkart Sellers", "Rs 24.09L", COLORS["red"]),
        ("Vijay Sales", "Rs 3,620", COLORS["red"]),
    ]:
        draw.rounded_rectangle((x1, yy, x2, yy + 62), radius=18, fill="#1F2024")
        draw.ellipse((x1 + 16, yy + 18, x1 + 40, yy + 42), fill="#402B2F")
        draw.text((x1 + 52, yy + 15), name, font=font(12, bold=True), fill="#FFFFFF")
        draw.text((x1 + 52, yy + 39), "Manager follow-up", font=font(10), fill=c)
        draw.text((x2 - 16, yy + 18), amt, font=font(11, bold=True), fill="#FFFFFF", anchor="ra")
        yy += 74
    draw.rounded_rectangle((x1 + 36, y2 - 76, x2 - 36, y2 - 20), radius=28, fill="#2C2D32")
    for i, lab in enumerate(["Home", "Orders", "Clients", "Approvals"]):
        cx = x1 + 55 + i * ((x2 - x1 - 110) // 3)
        draw.ellipse((cx - 12, y2 - 62, cx + 12, y2 - 38), outline="#B7BDC8", width=2)
        draw.text((cx, y2 - 27), lab, font=font(9), fill="#B7BDC8", anchor="mm")


def draw_orders_phone(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int]) -> None:
    x1, y1, x2, y2 = draw_phone_frame(draw, box, "Orders", COLORS["blue2"])
    draw.rounded_rectangle((x1, y1, x2, y1 + 46), radius=20, fill="#1F2024")
    draw.text((x1 + 22, y1 + 23), "Search order, ID, or client...", font=font(11), fill="#8A909B", anchor="lm")
    chips = ["All Orders", "Drafts", "Processing"]
    cx = x1
    for i, chip in enumerate(chips):
        tw, _ = text_size(draw, chip, font(12, bold=True))
        fill = "#FFFFFF" if i == 0 else "#202126"
        fg = "#111111" if i == 0 else "#9CA2AC"
        draw.rounded_rectangle((cx, y1 + 66, cx + tw + 30, y1 + 100), radius=17, fill=fill)
        draw.text((cx + 15, y1 + 83), chip, font=font(11, bold=True), fill=fg, anchor="lm")
        cx += tw + 42
    yy = y1 + 126
    data = [
        ("26-0001", "Pending", "Flipkart Sellers", "Rs 24.09L", COLORS["yellow"]),
        ("25-0106", "Delivered", "Reliance Digital", "Rs 10.95L", COLORS["green"]),
        ("25-0001", "Delivered", "Agarwal & Co.", "Rs 19.60L", COLORS["green"]),
    ]
    for oid, status, client, amount, c in data:
        draw.rounded_rectangle((x1, yy, x2, yy + 92), radius=22, fill="#1F2024")
        draw.rounded_rectangle((x1 + 16, yy + 14, x1 + 94, yy + 40), radius=10, fill="#33353B")
        draw.text((x1 + 55, yy + 27), oid, font=font(12, bold=True), fill="#D6DAE0", anchor="mm")
        draw.text((x1 + 108, yy + 26), f"- {status}", font=font(11, bold=True), fill=c, anchor="lm")
        draw.text((x1 + 16, yy + 52), client, font=font(13, bold=True), fill="#FFFFFF")
        draw.text((x1 + 16, yy + 75), "1/1 line items dispatched", font=font(11), fill="#858C97")
        draw.text((x2 - 16, yy + 52), amount, font=font(12, bold=True), fill="#FFFFFF", anchor="ra")
        yy += 108
    draw.ellipse((x2 - 82, y2 - 118, x2 - 10, y2 - 46), fill="#FFFFFF")
    draw.text((x2 - 46, y2 - 83), "+", font=font(38), fill="#111111", anchor="mm")


def draw_analytics_phone(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int]) -> None:
    x1, y1, x2, y2 = draw_phone_frame(draw, box, "Analytics", COLORS["yellow"])
    draw.rounded_rectangle((x1, y1, x2, y1 + 132), radius=28, fill="#1F2024", outline="#2D3037", width=2)
    draw.text((x1 + 22, y1 + 26), "QTD BOOKED DEMAND", font=font(11, bold=True), fill="#858C97")
    draw.text((x1 + 22, y1 + 67), "Rs 24.09L", font=F["phone_title"], fill="#FFFFFF")
    draw.text((x1 + 22, y1 + 96), "Fresh activity vs previous period", font=font(11, bold=True), fill="#D0D4DC")
    draw.line((x1 + 25, y1 + 116, x1 + 114, y1 + 130, x2 - 24, y1 + 128), fill="#1E92FF", width=4)
    yy = y1 + 154
    for label, value, c in [
        ("OPEN VALUE", "Rs 24.09L", COLORS["yellow"]),
        ("PENDING APPROVALS", "1", COLORS["orange"]),
        ("COLLECTIONS", "Rs 11.66L", COLORS["green"]),
    ]:
        draw.rounded_rectangle((x1, yy, x2, yy + 58), radius=18, fill="#1F2024")
        draw.ellipse((x1 + 18, yy + 13, x1 + 32, yy + 27), fill=c)
        draw.text((x1 + 46, yy + 13), label, font=font(10, bold=True), fill="#858C97")
        draw.text((x1 + 46, yy + 34), value, font=font(13, bold=True), fill="#FFFFFF")
        yy += 70


def draw_prototype_panel(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    draw = shadowed_card(img, box, radius=24, fill="#FFFFFF", outline=COLORS["purple"])
    x1, y1, x2, y2 = box
    section_pill(draw, x1 + 28, y1 - 38, x2 - x1 - 56, "PROTOTYPE", COLORS["purple"], "P")
    phones_top = y1 + 92
    phone_w = 290
    gap = 34
    start_x = x1 + 64
    for i, fn in enumerate([draw_dashboard_phone, draw_orders_phone, draw_analytics_phone]):
        fn(draw, (start_x + i * (phone_w + gap), phones_top, start_x + i * (phone_w + gap) + phone_w, y2 - 48))
    draw.text((x1 + 64, y2 - 24), "Dark mobile prototype: dashboard, orders, and analytics.", font=F["small"], fill=COLORS["muted"])


def draw_technology_panel(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    draw = shadowed_card(img, box, radius=24, fill="#FFFFFF", outline=COLORS["purple"])
    x1, y1, x2, y2 = box
    section_pill(draw, x1 + 28, y1 - 38, x2 - x1 - 56, "TECHNOLOGY / METHODS / ALGORITHM", COLORS["purple"], "T")
    y = y1 + 82
    col1_x = x1 + 42
    col2_x = x1 + 310
    draw.text((col1_x, y), "Technology", font=F["subsection"], fill="#8C2044")
    tech = [
        ("Frontend", "React Native + Expo"),
        ("Language", "TypeScript"),
        ("Routing", "Expo Router"),
        ("Backend", "Node.js + Express.js"),
        ("Data Store", "Google Sheets API"),
        ("State/Cache", "Context + AsyncStorage"),
        ("Charts", "react-native-svg"),
    ]
    yy = y + 44
    for i, (a, b) in enumerate(tech):
        color = [COLORS["blue2"], COLORS["green"], COLORS["orange"], COLORS["purple"], COLORS["red"]][i % 5]
        draw.ellipse((col1_x, yy + 2, col1_x + 28, yy + 30), fill=color)
        draw.text((col1_x + 42, yy), a, font=F["small_bold"], fill=COLORS["text"])
        draw.text((col1_x + 42, yy + 24), b, font=F["small"], fill=COLORS["muted"])
        yy += 62

    draw.text((col2_x, y), "Methods", font=F["subsection"], fill="#8C2044")
    methods = [
        "Design thinking and empathy mapping",
        "Role-based UX for sales, manager, warehouse",
        "REST API integration with demo backend",
        "Sheets-backed validation using realistic records",
        "Responsive mobile-first interface testing",
    ]
    yy = draw_bullets(draw, methods, col2_x, y + 44, x2 - col2_x - 40, F["small"], COLORS["text"], COLORS["green"], gap=9, bullet="dot")
    draw.text((col2_x, yy + 6), "Algorithm / Logic", font=F["subsection"], fill="#8C2044")
    logic = [
        "Login and load role-specific dashboard",
        "Create order with customer/product lookup",
        "Manager checks embedded ledger and approves",
        "Warehouse marks dispatched with timestamp",
        "Analytics summarizes revenue, orders, and risk",
    ]
    draw_bullets(draw, logic, col2_x, yy + 50, x2 - col2_x - 40, F["small"], COLORS["text"], COLORS["orange"], gap=8, bullet="dot")


def draw_workflow(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    draw = shadowed_card(img, box, radius=24, fill="#FFFFFF", outline=COLORS["blue"])
    x1, y1, x2, y2 = box
    section_pill(draw, x1 + 28, y1 - 38, x2 - x1 - 56, "WORKFLOW / PROCESS / FLOW CHART", COLORS["blue"], "W")
    steps = [
        ("1. Login", "Manager/User role loads saved session"),
        ("2. New Order", "Sales rep selects customer, product, quantity"),
        ("3. API + Sheets", "Backend validates and stores order data"),
        ("4. Approval", "Manager reviews ledger and approves/rejects"),
        ("5. Dispatch", "Warehouse packs and marks dispatched"),
        ("6. Analytics", "Owner sees demand, pipeline, collections"),
    ]
    card_w, card_h = 395, 132
    cols = 3
    gap_x = 190
    sx = x1 + ((x2 - x1) - (cols * card_w + (cols - 1) * gap_x)) // 2
    sy = y1 + 96
    gap_y = 82
    for idx, (title, sub) in enumerate(steps):
        row, col = divmod(idx, cols)
        cx = sx + col * (card_w + gap_x)
        cy = sy + row * (card_h + gap_y)
        color = [COLORS["blue2"], COLORS["green"], COLORS["orange"], COLORS["purple"], COLORS["red"], COLORS["yellow"]][idx]
        draw.rounded_rectangle((cx, cy, cx + card_w, cy + card_h), radius=18, fill="#F4F8FE", outline=color, width=3)
        draw.ellipse((cx + 16, cy + 21, cx + 62, cy + 67), fill=color)
        draw.text((cx + 39, cy + 44), str(idx + 1), font=F["small_bold"], fill="#FFFFFF", anchor="mm")
        draw.text((cx + 78, cy + 28), title, font=F["small_bold"], fill=COLORS["text"])
        draw_wrapped(draw, sub, (cx + 78, cy + 58), F["tiny"], COLORS["muted"], card_w - 96, line_gap=5)
        if idx < len(steps) - 1:
            if col < cols - 1:
                ax1, ay1, ax2, ay2 = cx + card_w + 12, cy + card_h // 2, cx + card_w + gap_x - 12, cy + card_h // 2
                draw.line((ax1, ay1, ax2, ay2), fill=COLORS["line"], width=4)
                draw.polygon([(ax2, ay2), (ax2 - 13, ay2 - 8), (ax2 - 13, ay2 + 8)], fill=COLORS["line"])
            else:
                ax = x1 + (x2 - x1) // 2
                draw.line((cx + card_w // 2, cy + card_h + 8, cx + card_w // 2, cy + card_h + gap_y - 12), fill=COLORS["line"], width=4)
                draw.polygon(
                    [
                        (cx + card_w // 2, cy + card_h + gap_y - 12),
                        (cx + card_w // 2 - 8, cy + card_h + gap_y - 25),
                        (cx + card_w // 2 + 8, cy + card_h + gap_y - 25),
                    ],
                    fill=COLORS["line"],
                )


def draw_results_conclusion(img: Image.Image, left_box: tuple[int, int, int, int], right_box: tuple[int, int, int, int]) -> None:
    draw_section_card(
        img,
        left_box,
        "RESULTS / OUTCOME",
        COLORS["green"],
        "R",
        bullets=[
            "Demonstrates complete order lifecycle: create, approve, dispatch, and analyze.",
            "Order creation target reduced to under 60 seconds for field sales reps.",
            "Manager approval target reduced to under 2 minutes using embedded ledger visibility.",
            "Google Sheets data flow validates realistic customers, products, orders, and analytics.",
            "Role-based interface improves clarity for sales reps, managers, and dispatch staff.",
        ],
    )
    draw_section_card(
        img,
        right_box,
        "CONCLUSION",
        COLORS["orange"],
        "C",
        body=(
            "The React Native Order & Sales Management App provides a practical mobile-first solution "
            "for traditional Tally-based order workflows. It removes duplicate data entry, improves "
            "credit-check decisions, creates digital dispatch records, and gives managers real-time "
            "business visibility through a connected mobile prototype."
        ),
    )


def draw_future_references(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    draw = shadowed_card(img, box, radius=24, fill="#FFFDF9", outline=COLORS["red"])
    x1, y1, x2, y2 = box
    section_pill(draw, x1 + 28, y1 - 38, x2 - x1 - 56, "FUTURE SCOPE", COLORS["red"], "F")
    future = [
        "JWT-based authentication and stronger backend validation",
        "Push notifications for pending approvals and order status changes",
        "Offline synchronization for low-network field visits",
        "Tally ERP CSV import/export pipeline for production data",
        "Date-range filters and deeper analytics for owner command center",
        "Barcode scanning and voice notes for faster order entry",
    ]
    mid = x1 + (x2 - x1) // 2
    y = y1 + 88
    draw_bullets(draw, future[:3], x1 + 46, y, mid - x1 - 70, F["small"], COLORS["text"], COLORS["green"], gap=13)
    draw_bullets(draw, future[3:], mid + 18, y, x2 - mid - 70, F["small"], COLORS["text"], COLORS["orange"], gap=13)

    ref_y = y1 + 234
    draw.rounded_rectangle((x1 + 34, ref_y, x2 - 34, y2 - 26), radius=20, fill="#FFFFFF", outline="#D55C85", width=2)
    draw.text((x1 + 62, ref_y + 28), "REFERENCES", font=F["subsection"], fill="#B01852")
    refs = [
        "https://reactnative.dev/",
        "https://docs.expo.dev/",
        "https://nodejs.org/ and https://expressjs.com/",
        "https://developers.google.com/sheets/api",
        "https://react-native-async-storage.github.io/async-storage/",
    ]
    col_w = (x2 - x1 - 150) // 2
    for idx, ref in enumerate(refs, 1):
        col = 0 if idx <= 3 else 1
        row = idx - 1 if idx <= 3 else idx - 4
        rx = x1 + 72 + col * col_w
        ry = ref_y + 76 + row * 34
        draw.text((rx, ry), f"{idx}. {ref}", font=F["small"], fill=COLORS["text"])


def draw_footer(img: Image.Image, top: int) -> None:
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, top, WIDTH, HEIGHT), fill=COLORS["navy"])
    draw.line((0, top, WIDTH, top), fill=COLORS["yellow"], width=5)
    y = top + 34
    draw.text((135, y), "DEVELOPED BY:", font=F["footer"], fill=COLORS["yellow"])
    students = [
        "PATEL ARYAN SURESHKUMAR (231130107046)",
        "DIVY NILESHKUMAR PATEL (231130107050)",
        "PADMRAJSINH ARJUNSINH BARAD (231130107036)",
        "SMIT AVINASH KUHIKAR (231130107027)",
        "UMERIMRAN KHAN (231130107068)",
    ]
    yy = y + 44
    for s in students:
        draw.text((135, yy), s, font=F["footer_small"], fill="#FFFFFF")
        yy += 30

    draw.line((930, top + 34, 930, HEIGHT - 34), fill="#4C5D89", width=3)
    draw.ellipse((1030, top + 54, 1140, top + 164), fill="#10295E", outline="#274B9F", width=3)
    draw.polygon([(1085, top + 80), (1134, top + 102), (1085, top + 124), (1036, top + 102)], fill=COLORS["yellow"])
    draw.rectangle((1065, top + 124, 1105, top + 142), fill=COLORS["yellow"])
    draw.text((1172, y), "COLLEGE:", font=F["footer"], fill=COLORS["yellow"])
    draw.text((1172, y + 48), "SAL College of Engineering", font=F["footer_small"], fill="#FFFFFF")

    draw.line((1530, top + 34, 1530, HEIGHT - 34), fill="#4C5D89", width=3)
    draw.ellipse((1630, top + 54, 1740, top + 164), fill="#10295E", outline="#274B9F", width=3)
    draw.ellipse((1672, top + 82, 1698, top + 108), fill=COLORS["yellow"])
    draw.rounded_rectangle((1657, top + 116, 1713, top + 151), radius=18, fill=COLORS["yellow"])
    draw.text((1772, y), "GUIDED BY:", font=F["footer"], fill=COLORS["yellow"])
    draw.text((1772, y + 48), "Prof. Janki Patel", font=F["footer_small"], fill="#FFFFFF")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGBA", (WIDTH, HEIGHT), COLORS["light"])
    draw = ImageDraw.Draw(img)
    draw_header(img)
    y = draw_hero(img, 370)

    # Top three summary panels.
    top_y = y + 54
    margin = 36
    gap = 26
    card_w = (WIDTH - 2 * margin - 2 * gap) // 3
    card_h = 365
    draw_section_card(
        img,
        (margin, top_y, margin + card_w, top_y + card_h),
        "INTRODUCTION",
        COLORS["blue"],
        "I",
        body=(
            "Field sales teams often write shop orders in notebooks, then re-enter them into Tally ERP. "
            "Managers manually check ledgers before approval and warehouse staff depend on printed dispatch lists. "
            "This creates delay, duplicate entry, limited visibility, and weak real-time control."
        ),
    )
    draw_section_card(
        img,
        (margin + card_w + gap, top_y, margin + 2 * card_w + gap, top_y + card_h),
        "ABSTRACT",
        COLORS["green"],
        "A",
        body=(
            "This project presents a React Native mobile application for small-to-medium distributors. "
            "It enables field sales representatives to create orders instantly, managers to approve with embedded "
            "customer ledger visibility, and warehouse staff to process dispatch digitally. The Expo frontend "
            "connects with a Node.js/Express demo backend and Google Sheets data flow."
        ),
    )
    draw_section_card(
        img,
        (margin + 2 * (card_w + gap), top_y, WIDTH - margin, top_y + card_h),
        "OBJECTIVES",
        COLORS["orange"],
        "O",
        bullets=[
            "Eliminate duplicate notebook-to-Tally order entry.",
            "Create sales orders on mobile in under 60 seconds.",
            "Reduce approval time using embedded ledger context.",
            "Track order status from pending to dispatched.",
            "Provide mobile analytics for managers and owners.",
        ],
    )

    mid_y = top_y + card_h + 92
    left_w = 905
    tech_box = (36, mid_y, 36 + left_w, mid_y + 690)
    proto_box = (36 + left_w + 28, mid_y, WIDTH - 36, mid_y + 690)
    draw_technology_panel(img, tech_box)
    draw_prototype_panel(img, proto_box)

    workflow_y = mid_y + 690 + 92
    draw_workflow(img, (36, workflow_y, WIDTH - 36, workflow_y + 475))

    rc_y = workflow_y + 475 + 92
    draw_results_conclusion(img, (36, rc_y, 1070, rc_y + 360), (1096, rc_y, WIDTH - 36, rc_y + 360))

    future_y = rc_y + 360 + 92
    draw_future_references(img, (36, future_y, WIDTH - 36, future_y + 455))

    draw_footer(img, 3780)

    # Thin outer border for the print-safe poster edge.
    draw.rounded_rectangle((18, 18, WIDTH - 18, HEIGHT - 18), radius=28, outline="#1E5A94", width=3)

    rgb = img.convert("RGB")
    rgb.save(PNG_OUT, quality=95, dpi=(72, 72))
    rgb.save(PDF_OUT, "PDF", resolution=72.0)
    print(PNG_OUT)
    print(PDF_OUT)


if __name__ == "__main__":
    main()
