from __future__ import annotations

import random
from pathlib import Path
from zipfile import ZipFile

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "poster_work"
WIDTH, HEIGHT = 2160, 4032

HEADER_SOURCE = ROOT / "nancy1" / "Poster Enh.jpg"
DOCX_SOURCE = ROOT / "FinalOMAEDIT PAGE - Tech Stack Appendices.docx"
ASSET_DIR = OUT_DIR / "prototype_assets"
HEADER_CROP_HEIGHT = 370

PNG_OUT = OUT_DIR / "oma_order_sales_management_poster_sample_format_4k.png"
PDF_OUT = OUT_DIR / "oma_order_sales_management_poster_sample_format_30x56in.pdf"

PROTOTYPE_FILES = {
    "dashboard": "dashboard.png",
    "orders": "orders.png",
    "clients": "clients.png",
    "approvals": "approvals.png",
    "login": "login.png",
    "dispatch": "dispatch.png",
    "analytics_qtd": "analytics-qtd.png",
    "analytics_ar": "analytics-ar.png",
}


def get_font(size: int, bold: bool = False, serif: bool = False) -> ImageFont.FreeTypeFont:
    if serif:
        candidates = [
            r"C:\Windows\Fonts\georgia.ttf",
            r"C:\Windows\Fonts\georgiab.ttf" if bold else r"C:\Windows\Fonts\georgia.ttf",
            r"C:\Windows\Fonts\times.ttf",
        ]
    elif bold:
        candidates = [
            r"C:\Windows\Fonts\arialbd.ttf",
            r"C:\Windows\Fonts\segoeuib.ttf",
            r"C:\Windows\Fonts\calibrib.ttf",
        ]
    else:
        candidates = [
            r"C:\Windows\Fonts\arial.ttf",
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\calibri.ttf",
        ]
    candidates.append("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


F = {
    "hero": get_font(76, bold=True),
    "hero_sub": get_font(34, bold=True),
    "section": get_font(35, bold=True),
    "card_title": get_font(28, bold=True),
    "body": get_font(22),
    "body_bold": get_font(22, bold=True),
    "small": get_font(18),
    "small_bold": get_font(18, bold=True),
    "tiny": get_font(14),
    "serif_body": get_font(22, serif=True),
    "footer": get_font(24, bold=True),
}


C = {
    "page": "#F4F8FF",
    "white": "#FFFFFF",
    "navy": "#031044",
    "blue": "#0B57B7",
    "deep_blue": "#092A71",
    "cyan": "#2CA8E8",
    "green": "#0CA66B",
    "orange": "#F4A20B",
    "purple": "#6B2DCB",
    "pink": "#CC1760",
    "red": "#E84B42",
    "yellow": "#FFD400",
    "text": "#101827",
    "muted": "#4F5B6F",
    "border": "#125A9F",
}


def text_box(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def wrap_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    line = ""
    for word in words:
        trial = word if not line else f"{line} {word}"
        if text_box(draw, trial, font)[0] <= width:
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
    x: int,
    y: int,
    width: int,
    font: ImageFont.ImageFont,
    fill: str = C["text"],
    gap: int = 8,
    max_lines: int | None = None,
) -> int:
    lines = wrap_lines(draw, text, font, width)
    if max_lines:
        lines = lines[:max_lines]
    line_h = text_box(draw, "Ag", font)[1] + gap
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += line_h
    return y


def draw_check_bullets(
    draw: ImageDraw.ImageDraw,
    items: list[str],
    x: int,
    y: int,
    width: int,
    color: str,
    font: ImageFont.ImageFont = F["body"],
    gap: int = 11,
) -> int:
    for item in items:
        draw.ellipse((x, y + 5, x + 24, y + 29), fill=color)
        draw.line((x + 7, y + 18, x + 11, y + 23, x + 19, y + 10), fill="white", width=4)
        y = draw_wrapped(draw, item, x + 38, y, width - 38, font, C["text"], gap=6) + gap
    return y


def card_shadow(img: Image.Image, box: tuple[int, int, int, int], radius: int = 18) -> None:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle(box, radius=radius, fill=(0, 30, 80, 28))
    layer = layer.filter(ImageFilter.GaussianBlur(10))
    img.alpha_composite(layer)


def draw_card(
    img: Image.Image,
    box: tuple[int, int, int, int],
    color: str,
    title: str,
    icon: str,
) -> tuple[ImageDraw.ImageDraw, int]:
    draw = ImageDraw.Draw(img)
    card_shadow(img, box)
    x1, y1, x2, y2 = box
    draw.rounded_rectangle(box, radius=20, fill=C["white"], outline=color, width=3)
    pill_x = x1 + 82
    draw.ellipse((x1 + 28, y1 - 42, x1 + 112, y1 + 42), fill=color, outline=C["white"], width=5)
    draw.text((x1 + 70, y1), icon, font=F["section"], fill="white", anchor="mm")
    draw.rounded_rectangle((pill_x, y1 - 30, x2 - 32, y1 + 28), radius=30, fill=color)
    draw.text((pill_x + 30, y1 - 1), title, font=F["section"], fill="white", anchor="lm")
    return draw, y1 + 70


def fit_cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    src_w, src_h = image.size
    scale = max(target_w / src_w, target_h / src_h)
    new_size = (int(src_w * scale), int(src_h * scale))
    resized = image.resize(new_size, Image.Resampling.LANCZOS)
    left = (new_size[0] - target_w) // 2
    top = (new_size[1] - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def fit_contain(image: Image.Image, size: tuple[int, int], bg: str = "#FFFFFF") -> Image.Image:
    target_w, target_h = size
    src_w, src_h = image.size
    scale = min(target_w / src_w, target_h / src_h)
    new_size = (int(src_w * scale), int(src_h * scale))
    resized = image.resize(new_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, bg)
    canvas.paste(resized, ((target_w - new_size[0]) // 2, (target_h - new_size[1]) // 2))
    return canvas


def load_docx_image(name: str) -> Image.Image | None:
    if not DOCX_SOURCE.exists():
        return None
    with ZipFile(DOCX_SOURCE) as archive:
        media_name = f"word/media/{name}"
        if media_name not in archive.namelist():
            return None
        with archive.open(media_name) as fp:
            return Image.open(fp).convert("RGB")


def load_prototype_images() -> dict[str, Image.Image]:
    images: dict[str, Image.Image] = {}
    for key, filename in PROTOTYPE_FILES.items():
        path = ASSET_DIR / filename
        if path.exists():
            images[key] = Image.open(path).convert("RGB")
    return images


def make_prototype_collage(images: list[tuple[str, Image.Image]], size: tuple[int, int]) -> Image.Image:
    w, h = size
    canvas = Image.new("RGB", size, "#111113")
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=22, fill="#111113", outline="#303238", width=2)
    if not images:
        return canvas
    gap = 24
    label_h = 40
    count = min(len(images), 4)
    shot_w = (w - gap * (count + 1)) // count
    shot_h = h - label_h - 2 * gap
    for i, (label, image) in enumerate(images[:count]):
        x = gap + i * (shot_w + gap)
        y = gap + label_h
        draw.text((x, gap), label, font=F["small_bold"], fill="#FFFFFF")
        thumb = fit_contain(image, (shot_w, shot_h), bg="#111113")
        mask = Image.new("L", (shot_w, shot_h), 0)
        md = ImageDraw.Draw(mask)
        md.rounded_rectangle((0, 0, shot_w, shot_h), radius=24, fill=255)
        canvas.paste(thumb, (x, y), mask)
    return canvas


def rounded_paste(base: Image.Image, image: Image.Image, box: tuple[int, int, int, int], radius: int) -> None:
    x1, y1, x2, y2 = box
    image = image.resize((x2 - x1, y2 - y1), Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", image.size, 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, image.size[0], image.size[1]), radius=radius, fill=255)
    base.paste(image, (x1, y1), mask)


def draw_header(img: Image.Image) -> int:
    draw = ImageDraw.Draw(img)
    header_src = Image.open(HEADER_SOURCE).convert("RGB")
    header = header_src.crop((0, 0, header_src.width, HEADER_CROP_HEIGHT))
    header = header.resize((WIDTH, 370), Image.Resampling.LANCZOS)
    img.paste(header, (0, 0))
    draw.line((0, 370, WIDTH, 370), fill="#DFE8F5", width=2)
    return 370


def draw_qr(draw: ImageDraw.ImageDraw, x: int, y: int, size: int = 118) -> None:
    random.seed(7)
    cells = 11
    cell = size // cells
    draw.rectangle((x, y, x + size, y + size), fill="white")
    for row in range(cells):
        for col in range(cells):
            marker = (row < 3 and col < 3) or (row < 3 and col > 7) or (row > 7 and col < 3)
            if marker or random.random() > 0.58:
                draw.rectangle((x + col * cell + 2, y + row * cell + 2, x + (col + 1) * cell - 2, y + (row + 1) * cell - 2), fill="#111111")


def draw_laptop(draw: ImageDraw.ImageDraw, img: Image.Image, box: tuple[int, int, int, int], screen: Image.Image | None) -> None:
    x1, y1, x2, y2 = box
    draw.rounded_rectangle((x1, y1, x2, y2), radius=24, fill="#101114", outline="#343942", width=5)
    sx1, sy1, sx2, sy2 = x1 + 30, y1 + 28, x2 - 30, y2 - 35
    draw.rectangle((sx1, sy1, sx2, sy2), fill="#FFFFFF")
    if screen is not None:
        rounded_paste(img, fit_cover(screen, (sx2 - sx1, sy2 - sy1)), (sx1, sy1, sx2, sy2), 4)
    draw.rounded_rectangle((x1 - 52, y2 - 14, x2 + 52, y2 + 25), radius=16, fill="#2D3139")
    draw.rounded_rectangle((x1 + 230, y2 - 9, x2 - 230, y2 + 3), radius=8, fill="#15171C")


def draw_phone(draw: ImageDraw.ImageDraw, img: Image.Image, box: tuple[int, int, int, int], screen: Image.Image | None) -> None:
    x1, y1, x2, y2 = box
    draw.rounded_rectangle((x1, y1, x2, y2), radius=54, fill="#111111", outline="#333333", width=5)
    sx1, sy1, sx2, sy2 = x1 + 18, y1 + 25, x2 - 18, y2 - 24
    draw.rounded_rectangle((sx1, sy1, sx2, sy2), radius=42, fill="#FFFFFF")
    if screen is not None:
        rounded_paste(img, fit_contain(screen, (sx2 - sx1, sy2 - sy1), bg="#111111"), (sx1, sy1, sx2, sy2), 38)
    draw.rounded_rectangle((x1 + 70, y1 + 8, x2 - 70, y1 + 35), radius=16, fill="#111111")


def draw_hero(img: Image.Image, top: int, screen1: Image.Image | None, screen2: Image.Image | None) -> int:
    draw = ImageDraw.Draw(img)
    x, y, w, h = 18, top + 18, WIDTH - 36, 560
    draw.rounded_rectangle((x, y, x + w, y + h), radius=16, fill=C["navy"])
    for i in range(h):
        r = int(3 + i / h * 10)
        g = int(16 + i / h * 28)
        b = int(68 + i / h * 45)
        draw.line((x, y + i, x + w, y + i), fill=(r, g, b), width=1)
    draw.rectangle((x + w // 2, y, x + w, y + h), fill="#123E7A")
    for i in range(0, 620, 62):
        draw.ellipse((x + 1120 + i, y + 65 + (i % 3) * 25, x + 1270 + i, y + 215 + (i % 3) * 25), fill="#FFFFFF18")

    draw.text((x + 72, y + 58), "REACT NATIVE", font=F["hero_sub"], fill=C["yellow"])
    draw.text((x + 72, y + 114), "ORDER & SALES", font=F["hero"], fill="white")
    draw.text((x + 72, y + 196), "MANAGEMENT APP", font=F["hero"], fill="white")
    draw.text((x + 72, y + 298), "Create It. Approve It. Dispatch It.", font=get_font(34, bold=True), fill="#E8F3FF")
    draw_qr(draw, x + 780, y + 94, 122)

    search_y = y + 388
    draw.rounded_rectangle((x + 72, search_y, x + 830, search_y + 78), radius=39, fill="white")
    draw.ellipse((x + 95, search_y + 20, x + 135, search_y + 60), outline=C["blue"], width=4)
    draw.line((x + 129, search_y + 54, x + 148, search_y + 70), fill=C["blue"], width=4)
    draw.text((x + 166, search_y + 39), "https://oma-order-sales-app", font=get_font(30, bold=True), fill="#111111", anchor="lm")
    draw.rounded_rectangle((x + 746, search_y + 10, x + 820, search_y + 68), radius=29, fill=C["blue"])
    draw.text((x + 783, search_y + 39), ">", font=get_font(34, bold=True), fill="white", anchor="mm")

    # Campus-like illustration ground behind product mockups.
    draw.rounded_rectangle((x + 1040, y + 92, x + w - 78, y + 420), radius=8, fill="#DAECFF")
    draw.rectangle((x + 1208, y + 172, x + 1690, y + 386), fill="#D48256")
    draw.rectangle((x + 1255, y + 118, x + 1638, y + 174), fill="#B96C45")
    draw.polygon([(x + 1180, y + 172), (x + 1444, y + 70), (x + 1710, y + 172)], fill="#8E4E38")
    for wx in range(x + 1275, x + 1600, 85):
        draw.rectangle((wx, y + 205, wx + 36, y + 250), fill="#C7E6FF")
        draw.rectangle((wx, y + 280, wx + 36, y + 325), fill="#C7E6FF")
    draw.rectangle((x + 1410, y + 300, x + 1480, y + 386), fill="#613927")
    draw.ellipse((x + 1340, y + 95, x + 1540, y + 295), fill="#FFFFFF25")

    draw_laptop(draw, img, (x + 1068, y + 232, x + 1708, y + 502), screen1)
    draw_phone(draw, img, (x + 1685, y + 155, x + 1945, y + 512), screen2)
    return y + h


def draw_top_cards(img: Image.Image, y: int) -> int:
    intro = (
        "Traditional field sales workflows rely on notebooks, Tally ERP checks, phone calls, and printed dispatch lists. "
        "This causes duplicate data entry, approval delays, weak status visibility, and no real-time business intelligence."
    )
    abstract = (
        "This project builds a React Native mobile app for small-to-medium distributors. Sales reps create orders instantly, "
        "managers approve with embedded ledger visibility, and warehouse staff process dispatch through a connected digital flow."
    )
    objectives = [
        "Eliminate duplicate notebook-to-Tally order entry.",
        "Create mobile sales orders in under 60 seconds.",
        "Reduce manager approval time with ledger context.",
        "Track status from pending approval to dispatch.",
        "Provide analytics for revenue, orders, and collections.",
    ]
    gap = 28
    x = 36
    w = (WIDTH - 72 - 2 * gap) // 3
    h = 420
    items = [
        (x, C["blue"], "INTRODUCTION", "I", intro, None),
        (x + w + gap, C["green"], "ABSTRACT", "A", abstract, None),
        (x + 2 * (w + gap), C["orange"], "OBJECTIVES", "O", None, objectives),
    ]
    for x1, color, title, icon, body, bullets in items:
        draw, cy = draw_card(img, (x1, y, x1 + w, y + h), color, title, icon)
        if body:
            draw_wrapped(draw, body, x1 + 46, cy + 24, w - 92, F["serif_body"], C["text"], gap=10)
        if bullets:
            draw_check_bullets(draw, bullets, x1 + 48, cy + 18, w - 96, color, F["body"], gap=6)
    return y + h


def draw_tech(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    draw, cy = draw_card(img, box, C["purple"], "TECHNOLOGY / METHODS / ALGORITHM", "T")
    x1, y1, x2, y2 = box
    left = x1 + 54
    mid = x1 + 330
    right = x1 + 500
    y = cy + 22
    draw.text((left, y), "Stack", font=F["card_title"], fill="#8C2044")
    stack = [
        ("RN", "React Native + Expo", C["cyan"]),
        ("TS", "TypeScript", C["blue"]),
        ("API", "Node.js + Express.js", C["green"]),
        ("DB", "Google Sheets API", C["orange"]),
        ("UX", "Expo Router + Context", C["purple"]),
        ("CH", "react-native-svg charts", C["red"]),
    ]
    yy = y + 52
    for short, label, color in stack:
        draw.ellipse((left, yy, left + 56, yy + 56), fill=color)
        draw.text((left + 28, yy + 28), short, font=F["small_bold"], fill="white", anchor="mm")
        draw_wrapped(draw, label, left + 72, yy + 4, mid - left - 88, F["small_bold"], C["text"], gap=5, max_lines=2)
        yy += 78

    draw.line((mid - 18, y + 8, mid - 18, y2 - 42), fill="#DCE4F0", width=2)
    draw.text((right, y), "Methods", font=F["card_title"], fill="#8C2044")
    methods = [
        "Requirement analysis and planning",
        "Design thinking and empathy mapping",
        "Role-based frontend development",
        "REST API and Sheets integration",
        "Prototype testing with realistic demo data",
    ]
    yy = draw_check_bullets(draw, methods, right, y + 54, x2 - right - 42, C["green"], F["small"], gap=5)
    draw.text((right, yy + 14), "Algorithm / Logic", font=F["card_title"], fill="#8C2044")
    logic = [
        "Login -> role dashboard",
        "Create order -> save through API",
        "Manager approval -> ledger review",
        "Dispatch -> timestamp update",
        "Analytics -> revenue and pipeline visibility",
    ]
    draw_check_bullets(draw, logic, right, yy + 66, x2 - right - 42, C["orange"], F["small"], gap=5)


def draw_prototype(img: Image.Image, box: tuple[int, int, int, int], screen1: Image.Image | None, screen2: Image.Image | None) -> None:
    draw, cy = draw_card(img, box, C["purple"], "PROTOTYPE", "P")
    x1, y1, x2, y2 = box
    draw_laptop(draw, img, (x1 + 58, cy + 50, x1 + 730, y2 - 56), screen1)
    draw_phone(draw, img, (x2 - 286, cy + 12, x2 - 34, y2 - 46), screen2)


def draw_flowchart(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    draw, cy = draw_card(img, box, C["blue"], "WORKFLOW / PROCESS / FLOW CHART", "W")
    x1, y1, x2, y2 = box
    center = (x1 + x2) // 2
    steps = [
        ("Start", "#BDE8A6"),
        ("User Register / Login", "#BEE4FF"),
        ("Create New Order", "#FFE4B8"),
        ("Manager Reviews Ledger", "#E3D5FF"),
        ("Approve / Reject Order", "#FFD0D0"),
        ("Warehouse Dispatch", "#D7F3E7"),
        ("Analytics Dashboard", "#E5E7EB"),
        ("Order Lifecycle Complete", "#BDE8A6"),
    ]
    y = cy + 20
    prev_bottom: int | None = None
    for idx, (label, fill) in enumerate(steps):
        w = 300 if idx not in (2, 3, 4, 5) else 340
        h = 62
        x = center - w // 2
        draw.rounded_rectangle((x, y, x + w, y + h), radius=30 if idx in (0, 7) else 14, fill=fill, outline="#7EA2C9", width=2)
        draw.text((center, y + h // 2), label, font=F["small_bold"], fill=C["text"], anchor="mm")
        if prev_bottom is not None:
            draw.line((center, prev_bottom + 8, center, y - 8), fill=C["deep_blue"], width=4)
            draw.polygon([(center, y - 4), (center - 10, y - 18), (center + 10, y - 18)], fill=C["deep_blue"])
        prev_bottom = y + h
        y += 108 if idx < 2 else 124

    # Side branch labels for source and update surfaces.
    side_items = [
        ("Customer", x1 + 48, cy + 250, C["orange"]),
        ("Products", x2 - 250, cy + 250, C["orange"]),
        ("Sheets API", x1 + 48, cy + 580, C["green"]),
        ("Status Update", x2 - 278, cy + 580, C["green"]),
    ]
    for label, sx, sy, color in side_items:
        draw.rounded_rectangle((sx, sy, sx + 220, sy + 54), radius=12, fill="#FFFFFF", outline=color, width=3)
        draw.text((sx + 110, sy + 27), label, font=F["small_bold"], fill=C["text"], anchor="mm")


def draw_results_conclusion(img: Image.Image, result_box: tuple[int, int, int, int], conclusion_box: tuple[int, int, int, int]) -> None:
    draw, cy = draw_card(img, result_box, "#0D9C9E", "RESULTS / OUTCOME", "R")
    x1, y1, x2, y2 = result_box
    results = [
        "Full Create -> Approve -> Dispatch workflow demonstrated.",
        "Order creation target reduced to under 60 seconds.",
        "Approval target reduced with embedded ledger data.",
        "Sheets-backed demo validates realistic records.",
        "Managers receive analytics for revenue and pipeline.",
    ]
    draw_check_bullets(draw, results, x1 + 48, cy + 24, x2 - x1 - 96, "#0D9C9E", F["small"], gap=7)

    draw, cy = draw_card(img, conclusion_box, C["purple"], "CONCLUSION", "C")
    x1, y1, x2, y2 = conclusion_box
    text = (
        "The React Native Order & Sales Management App delivers a modern mobile-first solution for Tally-based "
        "field sales workflows. It removes duplicate data entry, improves credit-check decisions, creates digital "
        "dispatch records, and gives managers real-time business visibility through an integrated prototype."
    )
    draw_wrapped(draw, text, x1 + 48, cy + 38, x2 - x1 - 96, F["serif_body"], C["text"], gap=10)


def draw_future_references(img: Image.Image, future_box: tuple[int, int, int, int], references_box: tuple[int, int, int, int]) -> None:
    draw, cy = draw_card(img, future_box, C["red"], "FUTURE SCOPE", "F")
    x1, y1, x2, y2 = future_box
    future = [
        "JWT-based authentication and stronger backend validation.",
        "Push notifications for approvals and dispatch updates.",
        "Offline synchronization for low-network field visits.",
        "Tally ERP CSV import/export pipeline.",
        "Barcode scanning and voice notes for faster order entry.",
        "Date-range filters and deeper owner analytics.",
    ]
    col_w = (x2 - x1 - 130) // 2
    draw_check_bullets(draw, future[:3], x1 + 52, cy + 28, col_w, C["green"], F["small"], gap=8)
    draw_check_bullets(draw, future[3:], x1 + 92 + col_w, cy + 28, col_w, C["orange"], F["small"], gap=8)

    draw, cy = draw_card(img, references_box, C["pink"], "REFERENCES", "R")
    x1, y1, x2, y2 = references_box
    refs = [
        "https://reactnative.dev/",
        "https://docs.expo.dev/",
        "https://nodejs.org/",
        "https://expressjs.com/",
        "https://developers.google.com/sheets/api",
        "https://react-native-async-storage.github.io/async-storage/",
    ]
    y = cy + 16
    for i, ref in enumerate(refs, 1):
        draw.text((x1 + 62, y), f"{i}. {ref}", font=F["small"], fill=C["text"])
        y += 36
    # Small book stack illustration like the sample.
    bx = x2 - 238
    by = y2 - 138
    for i, color in enumerate(["#D22630", "#254E9B", "#7B3F98"]):
        draw.rounded_rectangle((bx + 14 * i, by + 38 * i, bx + 180 + 14 * i, by + 34 + 38 * i), radius=8, fill=color)
        draw.rectangle((bx + 24 + 14 * i, by + 8 + 38 * i, bx + 174 + 14 * i, by + 26 + 38 * i), fill="#F9E6C9")


def draw_footer(img: Image.Image, top: int) -> None:
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, top, WIDTH, HEIGHT), fill=C["navy"])
    draw.line((0, top, WIDTH, top), fill=C["yellow"], width=6)
    y = top + 36
    # People icon
    draw.ellipse((80, y + 36, 122, y + 78), fill=C["yellow"])
    draw.ellipse((138, y + 36, 180, y + 78), fill=C["yellow"])
    draw.ellipse((196, y + 36, 238, y + 78), fill=C["yellow"])
    draw.rounded_rectangle((66, y + 88, 252, y + 138), radius=22, fill=C["yellow"])
    draw.text((305, y), "DEVELOPED BY:", font=F["footer"], fill=C["yellow"])
    students = [
        "PATEL ARYAN SURESHKUMAR   (231130107046)",
        "DIVY NILESHKUMAR PATEL   (231130107050)",
        "PADMRAJSINH ARJUNSINH BARAD   (231130107036)",
        "SMIT AVINASH KUHIKAR   (231130107027)",
        "UMERIMRAN KHAN   (231130107068)",
    ]
    yy = y + 40
    for student in students:
        draw.text((305, yy), student, font=F["small"], fill="white")
        yy += 31

    draw.line((890, top + 36, 890, HEIGHT - 36), fill="#7381A4", width=2)
    draw.ellipse((1040, top + 58, 1190, top + 208), fill="#0C2466", outline="#274B9F", width=3)
    draw.polygon([(1115, top + 86), (1180, top + 116), (1115, top + 148), (1050, top + 116)], fill=C["yellow"])
    draw.rectangle((1088, top + 145, 1142, top + 170), fill=C["yellow"])
    draw.text((1238, y), "COLLEGE :", font=F["footer"], fill=C["yellow"])
    draw.text((1238, y + 48), "Sal College of Engineering", font=F["small"], fill="white")

    draw.line((1545, top + 36, 1545, HEIGHT - 36), fill="#7381A4", width=2)
    draw.ellipse((1688, top + 58, 1838, top + 208), fill="#0C2466", outline="#274B9F", width=3)
    draw.ellipse((1748, top + 89, 1778, top + 119), fill=C["yellow"])
    draw.rounded_rectangle((1722, top + 132, 1804, top + 184), radius=24, fill=C["yellow"])
    draw.text((1882, y), "GUIDED BY :", font=F["footer"], fill=C["yellow"])
    draw.text((1882, y + 48), "Prof. Janki Patel", font=F["small"], fill="white")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGBA", (WIDTH, HEIGHT), C["page"])
    prototype_images = load_prototype_images()
    if prototype_images:
        hero_screen = make_prototype_collage(
            [
                ("Dashboard", prototype_images.get("dashboard")),
                ("Orders", prototype_images.get("orders")),
                ("Analytics", prototype_images.get("analytics_qtd")),
                ("Approvals", prototype_images.get("approvals")),
            ],
            (1600, 560),
        )
        prototype_screen = make_prototype_collage(
            [
                ("Orders", prototype_images.get("orders")),
                ("Analytics", prototype_images.get("analytics_qtd")),
                ("Approvals", prototype_images.get("approvals")),
            ],
            (920, 760),
        )
        screen2 = prototype_images.get("login") or prototype_images.get("analytics_qtd")
        prototype_phone = prototype_images.get("analytics_qtd") or prototype_images.get("orders")
    else:
        hero_screen = load_docx_image("image9.png")
        prototype_screen = hero_screen
        screen2 = load_docx_image("image10.png")
        prototype_phone = screen2

    draw_header(img)
    hero_bottom = draw_hero(img, 370, hero_screen, screen2)
    cards_bottom = draw_top_cards(img, hero_bottom + 70)

    left_x, right_x = 36, 965
    left_w, right_w = 890, WIDTH - right_x - 36
    mid_y = cards_bottom + 90
    draw_tech(img, (left_x, mid_y, left_x + left_w, mid_y + 790))
    draw_prototype(img, (right_x, mid_y, right_x + right_w, mid_y + 790), prototype_screen, prototype_phone)

    low_y = mid_y + 840
    draw_flowchart(img, (left_x, low_y, left_x + left_w, 3632))
    draw_results_conclusion(
        img,
        (right_x, low_y, right_x + 540, low_y + 390),
        (right_x + 570, low_y, right_x + right_w, low_y + 390),
    )
    draw_future_references(
        img,
        (right_x, low_y + 445, right_x + right_w, low_y + 780),
        (right_x, low_y + 835, right_x + right_w, 3632),
    )
    draw_footer(img, 3674)

    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((18, 18, WIDTH - 18, HEIGHT - 18), radius=28, outline="#1E5A94", width=3)

    rgb = img.convert("RGB")
    rgb.save(PNG_OUT, quality=95, dpi=(72, 72))
    rgb.save(PDF_OUT, "PDF", resolution=72.0)
    print(PNG_OUT)
    print(PDF_OUT)


if __name__ == "__main__":
    main()
