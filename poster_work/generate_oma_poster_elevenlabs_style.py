from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "poster_work"
ASSET_DIR = OUT_DIR / "prototype_assets"
HEADER_SOURCE = ROOT / "nancy1" / "Poster Enh.jpg"

WIDTH, HEIGHT = 2160, 4032
HEADER_CROP_HEIGHT = 370

PNG_OUT = OUT_DIR / "oma_order_sales_management_poster_elevenlabs_4k.png"
PDF_OUT = OUT_DIR / "oma_order_sales_management_poster_elevenlabs_30x56in.pdf"


TOKENS = {
    "eggshell": "#fdfcfc",
    "powder": "#f5f3f1",
    "chalk": "#e5e5e5",
    "fog": "#b1b0b0",
    "gravel": "#777169",
    "slate": "#a59f97",
    "obsidian": "#000000",
    "signal": "#0447ff",
    "ember": "#ff4704",
    "voice": "#3d75d8",
}


PROTOTYPES = {
    "Dashboard": "dashboard.png",
    "Orders": "orders.png",
    "Analytics": "analytics-qtd.png",
    "Approvals": "approvals.png",
    "Login": "login.png",
    "Dispatch": "dispatch.png",
    "Clients": "clients.png",
}


def font(size: int, bold: bool = False, serif: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    if mono:
        candidates = [
            r"C:\Windows\Fonts\consola.ttf",
            r"C:\Windows\Fonts\cour.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        ]
    elif serif:
        candidates = [
            r"C:\Windows\Fonts\georgiab.ttf" if bold else r"C:\Windows\Fonts\georgia.ttf",
            r"C:\Windows\Fonts\cambria.ttc",
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
    "display": font(82, serif=True),
    "display_sm": font(56, serif=True),
    "heading": font(36, serif=True),
    "section": font(24, bold=True),
    "label": font(17, bold=True),
    "body": font(22),
    "body_bold": font(22, bold=True),
    "small": font(18),
    "small_bold": font(18, bold=True),
    "caption": font(14),
    "mono": font(16, mono=True),
    "footer": font(21, bold=True),
}


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    line = ""
    for word in words:
        test = word if not line else f"{line} {word}"
        if text_size(draw, test, fnt)[0] <= width:
            line = test
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
    fnt: ImageFont.ImageFont,
    fill: str = TOKENS["obsidian"],
    gap: int = 8,
    max_lines: int | None = None,
) -> int:
    lines = wrap(draw, text, fnt, width)
    if max_lines is not None:
        lines = lines[:max_lines]
    line_h = text_size(draw, "Ag", fnt)[1] + gap
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += line_h
    return y


def hairline_card(img: Image.Image, box: tuple[int, int, int, int], fill: str = "#ffffff", radius: int = 22) -> ImageDraw.ImageDraw:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(layer)
    sd.rounded_rectangle(box, radius=radius, fill=(0, 0, 0, 18))
    layer = layer.filter(ImageFilter.GaussianBlur(2))
    img.alpha_composite(layer)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=TOKENS["chalk"], width=2)
    return draw


def pill(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, fill: str = TOKENS["obsidian"], fg: str = TOKENS["eggshell"], fnt: ImageFont.ImageFont = F["label"]) -> tuple[int, int, int, int]:
    tw, th = text_size(draw, text, fnt)
    w, h = tw + 44, max(38, th + 18)
    draw.rounded_rectangle((x, y, x + w, y + h), radius=h // 2, fill=fill, outline=TOKENS["chalk"], width=1)
    draw.text((x + w // 2, y + h // 2 + 1), text, font=fnt, fill=fg, anchor="mm")
    return (x, y, x + w, y + h)


def section_title(draw: ImageDraw.ImageDraw, x: int, y: int, label: str, title: str, accent: str = TOKENS["signal"]) -> int:
    draw.ellipse((x, y + 9, x + 16, y + 25), fill=accent)
    pill(draw, x + 30, y, label.upper(), TOKENS["obsidian"], TOKENS["eggshell"], F["label"])
    draw.text((x, y + 58), title, font=F["heading"], fill=TOKENS["obsidian"])
    return y + 110


def bullets(draw: ImageDraw.ImageDraw, items: list[str], x: int, y: int, width: int, accent: str = TOKENS["signal"], fnt: ImageFont.ImageFont = F["small"]) -> int:
    for item in items:
        draw.ellipse((x, y + 7, x + 14, y + 21), fill=accent)
        y = draw_wrapped(draw, item, x + 30, y, width - 30, fnt, TOKENS["obsidian"], gap=5) + 13
    return y


def load_images() -> dict[str, Image.Image]:
    images: dict[str, Image.Image] = {}
    for label, filename in PROTOTYPES.items():
        path = ASSET_DIR / filename
        if path.exists():
            images[label] = Image.open(path).convert("RGB")
    return images


def fit_contain(image: Image.Image, size: tuple[int, int], bg: str = "#111111") -> Image.Image:
    w, h = size
    source_w, source_h = image.size
    scale = min(w / source_w, h / source_h)
    resized = image.resize((int(source_w * scale), int(source_h * scale)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, bg)
    canvas.paste(resized, ((w - resized.width) // 2, (h - resized.height) // 2))
    return canvas


def masked_paste(base: Image.Image, image: Image.Image, box: tuple[int, int, int, int], radius: int) -> None:
    x1, y1, x2, y2 = box
    image = image.resize((x2 - x1, y2 - y1), Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", image.size, 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, image.width, image.height), radius=radius, fill=255)
    base.paste(image, (x1, y1), mask)


def draw_phone(base: Image.Image, draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], screenshot: Image.Image, label: str | None = None) -> None:
    x1, y1, x2, y2 = box
    draw.rounded_rectangle((x1, y1, x2, y2), radius=52, fill="#0e0e10", outline="#2d2d30", width=5)
    sx1, sy1, sx2, sy2 = x1 + 18, y1 + 22, x2 - 18, y2 - 22
    shot = fit_contain(screenshot, (sx2 - sx1, sy2 - sy1), "#111111")
    masked_paste(base, shot, (sx1, sy1, sx2, sy2), 38)
    draw.rounded_rectangle((x1 + 75, y1 + 10, x2 - 75, y1 + 34), radius=13, fill="#0e0e10")
    if label:
        tw, _ = text_size(draw, label, F["caption"])
        draw.rounded_rectangle((x1 + (x2 - x1 - tw - 34) // 2, y2 + 10, x1 + (x2 - x1 + tw + 34) // 2, y2 + 42), radius=16, fill=TOKENS["powder"], outline=TOKENS["chalk"], width=1)
        draw.text(((x1 + x2) // 2, y2 + 27), label, font=F["caption"], fill=TOKENS["gravel"], anchor="mm")


def draw_header(img: Image.Image) -> int:
    header_src = Image.open(HEADER_SOURCE).convert("RGB")
    header = header_src.crop((0, 0, header_src.width, HEADER_CROP_HEIGHT))
    header = header.resize((WIDTH, HEADER_CROP_HEIGHT), Image.Resampling.LANCZOS)
    img.paste(header, (0, 0))
    draw = ImageDraw.Draw(img)
    draw.line((0, HEADER_CROP_HEIGHT, WIDTH, HEADER_CROP_HEIGHT), fill=TOKENS["chalk"], width=2)
    return HEADER_CROP_HEIGHT


def draw_hero(img: Image.Image, top: int, images: dict[str, Image.Image]) -> int:
    draw = ImageDraw.Draw(img)
    y = top + 52
    x = 72
    pill(draw, x, y, "REACT NATIVE")
    title_y = y + 78
    draw.text((x, title_y), "Order & Sales", font=F["display"], fill=TOKENS["obsidian"])
    draw.text((x, title_y + 86), "Management App", font=F["display"], fill=TOKENS["obsidian"])
    draw_wrapped(
        draw,
        "A mobile-first order lifecycle instrument for field teams: create orders, approve with ledger context, dispatch digitally, and monitor live sales risk.",
        x,
        title_y + 202,
        820,
        F["body"],
        TOKENS["gravel"],
        gap=8,
        max_lines=4,
    )
    pill(draw, x, title_y + 338, "Create > Approve > Dispatch")
    pill(draw, x + 368, title_y + 338, "Sheets-backed prototype", TOKENS["white"] if False else "#ffffff", TOKENS["obsidian"])

    card = (1010, y, WIDTH - 72, y + 470)
    hairline_card(img, card, "#ffffff", 24)
    cx1, cy1, cx2, cy2 = card
    draw.text((cx1 + 42, cy1 + 34), "Prototype preview", font=F["heading"], fill=TOKENS["obsidian"])
    draw.text((cx1 + 42, cy1 + 84), "Actual dark OMA screens embedded as product evidence.", font=F["small"], fill=TOKENS["gravel"])
    labels = ["Dashboard", "Orders", "Analytics", "Approvals"]
    px = cx1 + 44
    py = cy1 + 135
    for idx, label in enumerate(labels):
        shot = images.get(label)
        if shot is None:
            continue
        phone_w, phone_h = 162, 350
        draw_phone(img, draw, (px + idx * 190, py, px + idx * 190 + phone_w, py + phone_h), shot, None)
    if "Login" in images:
        draw_phone(img, draw, (cx2 - 230, cy1 + 88, cx2 - 54, cy1 + 418), images["Login"], None)
    draw.ellipse((cx2 - 280, cy1 + 56, cx2 - 264, cy1 + 72), fill=TOKENS["signal"])
    draw.ellipse((cx2 - 252, cy1 + 56, cx2 - 236, cy1 + 72), fill=TOKENS["ember"])
    draw.text((cx2 - 218, cy1 + 51), "Live OMA prototype", font=F["caption"], fill=TOKENS["slate"])
    return y + 520


def draw_intro_row(img: Image.Image, y: int) -> int:
    draw = ImageDraw.Draw(img)
    gap = 28
    x = 72
    w = (WIDTH - 144 - 2 * gap) // 3
    h = 345
    cards = [
        (
            "INTRODUCTION",
            "Problem context",
            "Traditional field sales depends on notebooks, Tally checks, phone calls, and printed dispatch lists. This creates duplicate entry, approval delay, and weak real-time control.",
            TOKENS["signal"],
        ),
        (
            "ABSTRACT",
            "Project summary",
            "The React Native app connects sales reps, managers, and warehouse staff through an Expo frontend, Node.js REST API, and Google Sheets-backed operational data flow.",
            TOKENS["ember"],
        ),
        (
            "OBJECTIVES",
            "Measurable goals",
            "Eliminate duplicate entry, create orders in under 60 seconds, reduce approval time with ledger visibility, track dispatch, and surface owner analytics.",
            TOKENS["signal"],
        ),
    ]
    for i, (label, title, body, accent) in enumerate(cards):
        box = (x + i * (w + gap), y, x + i * (w + gap) + w, y + h)
        hairline_card(img, box, "#ffffff", 20)
        bx1, by1, bx2, _ = box
        section_title(draw, bx1 + 34, by1 + 32, label, title, accent)
        draw_wrapped(draw, body, bx1 + 34, by1 + 154, bx2 - bx1 - 68, F["body"], TOKENS["gravel"], gap=8)
    return y + h


def draw_tech(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    draw = hairline_card(img, box, "#ffffff", 20)
    x1, y1, x2, y2 = box
    section_title(draw, x1 + 34, y1 + 30, "TECH", "Technology / methods", TOKENS["signal"])
    stack = [
        ("RN", "React Native + Expo"),
        ("TS", "TypeScript"),
        ("API", "Node.js + Express.js"),
        ("DATA", "Google Sheets API"),
        ("STATE", "React Context + AsyncStorage"),
        ("CHART", "react-native-svg"),
    ]
    sx, sy = x1 + 42, y1 + 160
    for i, (code, text) in enumerate(stack):
        dot = TOKENS["signal"] if i % 2 == 0 else TOKENS["ember"]
        draw.ellipse((sx, sy + i * 58 + 7, sx + 14, sy + i * 58 + 21), fill=dot)
        draw.text((sx + 34, sy + i * 58), code, font=F["mono"], fill=TOKENS["obsidian"])
        draw.text((sx + 128, sy + i * 58), text, font=F["small"], fill=TOKENS["gravel"])
    draw.line((x1 + 390, y1 + 170, x1 + 390, y2 - 44), fill=TOKENS["chalk"], width=2)
    methods = [
        "Design thinking and empathy mapping",
        "Role-based mobile UX",
        "REST API integration",
        "Sheets-backed validation",
        "Prototype verification with demo data",
    ]
    draw.text((x1 + 430, y1 + 160), "Methods", font=F["body_bold"], fill=TOKENS["obsidian"])
    bullets(draw, methods, x1 + 430, y1 + 205, x2 - x1 - 470, TOKENS["signal"], F["small"])
    logic = [
        "Login -> role dashboard",
        "Order -> API -> Sheets",
        "Ledger review -> approval",
        "Dispatch timestamp -> analytics",
    ]
    draw.text((x1 + 430, y1 + 420), "Algorithm / logic", font=F["body_bold"], fill=TOKENS["obsidian"])
    bullets(draw, logic, x1 + 430, y1 + 465, x2 - x1 - 470, TOKENS["ember"], F["small"])


def draw_prototype(img: Image.Image, box: tuple[int, int, int, int], images: dict[str, Image.Image]) -> None:
    draw = hairline_card(img, box, "#ffffff", 20)
    x1, y1, x2, y2 = box
    section_title(draw, x1 + 34, y1 + 30, "PROTOTYPE", "Working screens", TOKENS["ember"])
    labels = ["Orders", "Analytics", "Approvals", "Dispatch"]
    start_x = x1 + 52
    start_y = y1 + 160
    phone_w, phone_h, gap = 210, 455, 28
    for i, label in enumerate(labels):
        shot = images.get(label)
        if shot is None:
            continue
        draw_phone(img, draw, (start_x + i * (phone_w + gap), start_y, start_x + i * (phone_w + gap) + phone_w, start_y + phone_h), shot, label)
    draw.text((x1 + 54, y2 - 44), "Correct prototype screenshots from the OMA dark mobile interface.", font=F["small"], fill=TOKENS["gravel"])


def draw_workflow(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    draw = hairline_card(img, box, "#ffffff", 20)
    x1, y1, x2, y2 = box
    section_title(draw, x1 + 34, y1 + 30, "FLOW", "Workflow / process", TOKENS["signal"])
    steps = [
        ("01", "Sign in", "Manager or worker role opens the OMA workspace."),
        ("02", "Create order", "Sales rep selects client, product, quantity, and source."),
        ("03", "Review ledger", "Manager checks exposure, credit status, and order value."),
        ("04", "Approve / reject", "Decision updates order status and queue priority."),
        ("05", "Dispatch", "Warehouse picks items and records fulfillment timestamp."),
        ("06", "Analyze", "Owner dashboard shows demand, collections, and risk."),
    ]
    sx, sy = x1 + 54, y1 + 164
    node_w, node_h = x2 - x1 - 108, 94
    for i, (num, title, body) in enumerate(steps):
        y = sy + i * 128
        fill = TOKENS["powder"] if i % 2 == 0 else "#ffffff"
        draw.rounded_rectangle((sx, y, sx + node_w, y + node_h), radius=18, fill=fill, outline=TOKENS["chalk"], width=2)
        accent = TOKENS["signal"] if i % 2 == 0 else TOKENS["ember"]
        draw.ellipse((sx + 22, y + 28, sx + 58, y + 64), fill=accent)
        draw.text((sx + 40, y + 47), num, font=F["caption"], fill=TOKENS["eggshell"], anchor="mm")
        draw.text((sx + 84, y + 20), title, font=F["body_bold"], fill=TOKENS["obsidian"])
        draw_wrapped(draw, body, sx + 84, y + 50, node_w - 120, F["small"], TOKENS["gravel"], gap=4, max_lines=2)
        if i < len(steps) - 1:
            draw.line((sx + node_w // 2, y + node_h + 8, sx + node_w // 2, y + 120), fill=TOKENS["chalk"], width=3)
            draw.polygon([(sx + node_w // 2, y + 124), (sx + node_w // 2 - 8, y + 110), (sx + node_w // 2 + 8, y + 110)], fill=TOKENS["chalk"])


def draw_results_future_refs(img: Image.Image, x: int, y: int, w: int) -> None:
    draw = ImageDraw.Draw(img)
    result_box = (x, y, x + w // 2 - 14, y + 330)
    conclusion_box = (x + w // 2 + 14, y, x + w, y + 330)
    hairline_card(img, result_box, "#ffffff", 20)
    hairline_card(img, conclusion_box, "#ffffff", 20)
    section_title(draw, result_box[0] + 34, result_box[1] + 30, "RESULTS", "Outcomes", TOKENS["signal"])
    bullets(
        draw,
        [
            "Create -> Approve -> Dispatch flow demonstrated.",
            "Order creation target under 60 seconds.",
            "Ledger visibility reduces approval friction.",
            "Sheets data validates realistic records.",
        ],
        result_box[0] + 42,
        result_box[1] + 152,
        result_box[2] - result_box[0] - 84,
        TOKENS["signal"],
        F["small"],
    )
    section_title(draw, conclusion_box[0] + 34, conclusion_box[1] + 30, "CONCLUSION", "Business value", TOKENS["ember"])
    draw_wrapped(
        draw,
        "The React Native Order & Sales Management App replaces manual order handoffs with a mobile-first workflow for field sales, manager approval, digital dispatch, and owner analytics.",
        conclusion_box[0] + 42,
        conclusion_box[1] + 152,
        conclusion_box[2] - conclusion_box[0] - 84,
        F["body"],
        TOKENS["gravel"],
        gap=8,
    )

    future_box = (x, y + 370, x + w, y + 700)
    refs_box = (x, y + 740, x + w, y + 1160)
    hairline_card(img, future_box, TOKENS["powder"], 20)
    hairline_card(img, refs_box, "#ffffff", 20)
    section_title(draw, future_box[0] + 34, future_box[1] + 30, "FUTURE", "Next scope", TOKENS["signal"])
    future = [
        "JWT authentication and backend validation",
        "Push notifications for order status",
        "Offline synchronization for field visits",
        "Tally ERP CSV import/export pipeline",
        "Barcode scanning and voice notes",
        "Date filters and deeper analytics",
    ]
    col = (w - 120) // 2
    bullets(draw, future[:3], future_box[0] + 42, future_box[1] + 152, col, TOKENS["signal"], F["small"])
    bullets(draw, future[3:], future_box[0] + 80 + col, future_box[1] + 152, col, TOKENS["ember"], F["small"])

    section_title(draw, refs_box[0] + 34, refs_box[1] + 30, "REFERENCES", "Source stack", TOKENS["ember"])
    refs = [
        "reactnative.dev",
        "docs.expo.dev",
        "nodejs.org",
        "expressjs.com",
        "developers.google.com/sheets/api",
        "react-native-async-storage.github.io",
    ]
    yy = refs_box[1] + 154
    for i, ref in enumerate(refs, 1):
        draw.text((refs_box[0] + 50, yy), f"{i:02d}", font=F["mono"], fill=TOKENS["slate"])
        draw.text((refs_box[0] + 104, yy), ref, font=F["small"], fill=TOKENS["obsidian"])
        yy += 43


def draw_footer(img: Image.Image, top: int) -> None:
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, top, WIDTH, HEIGHT), fill=TOKENS["obsidian"])
    y = top + 42
    draw.ellipse((72, y + 8, 88, y + 24), fill=TOKENS["signal"])
    draw.ellipse((98, y + 8, 114, y + 24), fill=TOKENS["ember"])
    draw.text((140, y), "DEVELOPED BY", font=F["footer"], fill=TOKENS["eggshell"])
    students = [
        "PATEL ARYAN SURESHKUMAR  231130107046",
        "DIVY NILESHKUMAR PATEL  231130107050",
        "PADMRAJSINH ARJUNSINH BARAD  231130107036",
        "SMIT AVINASH KUHIKAR  231130107027",
        "UMERIMRAN KHAN  231130107068",
    ]
    yy = y + 44
    for student in students:
        draw.text((140, yy), student, font=F["small"], fill=TOKENS["fog"])
        yy += 31
    draw.line((900, top + 44, 900, HEIGHT - 44), fill="#2b2b2b", width=2)
    draw.text((980, y), "COLLEGE", font=F["footer"], fill=TOKENS["eggshell"])
    draw.text((980, y + 48), "SAL College of Engineering", font=F["small"], fill=TOKENS["fog"])
    draw.line((1510, top + 44, 1510, HEIGHT - 44), fill="#2b2b2b", width=2)
    draw.text((1590, y), "GUIDED BY", font=F["footer"], fill=TOKENS["eggshell"])
    draw.text((1590, y + 48), "Prof. Janki Patel", font=F["small"], fill=TOKENS["fog"])


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    images = load_images()
    img = Image.new("RGBA", (WIDTH, HEIGHT), TOKENS["eggshell"])
    draw_header(img)
    hero_bottom = draw_hero(img, HEADER_CROP_HEIGHT, images)
    intro_bottom = draw_intro_row(img, hero_bottom + 34)

    mid_y = intro_bottom + 56
    draw_tech(img, (72, mid_y, 930, mid_y + 650))
    draw_prototype(img, (970, mid_y, WIDTH - 72, mid_y + 650), images)

    lower_y = mid_y + 700
    draw_workflow(img, (72, lower_y, 930, 3630))
    draw_results_future_refs(img, 970, lower_y, WIDTH - 1042)
    draw_footer(img, 3675)

    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((18, 18, WIDTH - 18, HEIGHT - 18), radius=28, outline=TOKENS["chalk"], width=2)
    rgb = img.convert("RGB")
    rgb.save(PNG_OUT, quality=95, dpi=(72, 72))
    rgb.save(PDF_OUT, "PDF", resolution=72.0)
    print(PNG_OUT)
    print(PDF_OUT)


if __name__ == "__main__":
    main()
