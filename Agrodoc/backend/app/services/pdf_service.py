import os
from datetime import datetime
from typing import Dict, Any, List
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image as RLImage,
    KeepTogether,
    HRFlowable,
)
from ..config import settings


def generate_crop_health_pdf(
    report_id: int,
    scan_date: datetime,
    field_location: str,
    prediction: str,
    health_status: str,
    confidence: float,
    confidence_level: str,
    analysis_text: str,
    recommendations: List[str],
    image_path: str = None,
) -> str:
    """
    Generates a formal, printable PDF crop health report for AgroDoc.
    Saves to backend/reports/report_{id}.pdf and returns the file path.
    """
    os.makedirs(settings.report_dir, exist_ok=True)
    pdf_filename = f"agrodoc_report_{report_id}.pdf"
    pdf_filepath = os.path.join(settings.report_dir, pdf_filename)

    doc = SimpleDocTemplate(
        pdf_filepath,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()
    
    # Custom styles
    brand_style = ParagraphStyle(
        "BrandHeader",
        parent=styles["Heading1"],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1b4d24"),
        fontName="Helvetica-Bold",
    )
    
    subtitle_style = ParagraphStyle(
        "SubHeader",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#4b5563"),
    )

    section_title = ParagraphStyle(
        "SectionTitle",
        parent=styles["Heading2"],
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#1b4d24"),
        fontName="Helvetica-Bold",
        spaceBefore=10,
        spaceAfter=6,
    )

    body_style = ParagraphStyle(
        "BodyDark",
        parent=styles["Normal"],
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#1f2937"),
    )

    disclaimer_style = ParagraphStyle(
        "Disclaimer",
        parent=styles["Italic"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#6b7280"),
    )

    story = []

    # 1. Header Banner
    story.append(Paragraph("AGRODOC | CROP INTELLIGENCE", brand_style))
    story.append(Paragraph("FIELD INTELLIGENCE & AUTOMATED TOMATO DIAGNOSTIC REPORT", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#16a34a"), spaceBefore=8, spaceAfter=12))

    # 2. Metadata Table
    status_color = "#16a34a" if health_status.lower() == "healthy" else "#dc2626"
    
    meta_data = [
        [
            Paragraph("<b>Report ID:</b>", body_style),
            Paragraph(f"AD-{report_id:04d}", body_style),
            Paragraph("<b>Scan Date:</b>", body_style),
            Paragraph(scan_date.strftime("%Y-%m-%d %H:%M UTC"), body_style),
        ],
        [
            Paragraph("<b>Target Crop:</b>", body_style),
            Paragraph("Tomato (Solanum lycopersicum)", body_style),
            Paragraph("<b>Location:</b>", body_style),
            Paragraph(field_location or "Unspecified Field", body_style),
        ],
        [
            Paragraph("<b>Diagnosis:</b>", body_style),
            Paragraph(f"<b>{prediction}</b>", body_style),
            Paragraph("<b>Health Status:</b>", body_style),
            Paragraph(f"<font color='{status_color}'><b>{health_status.upper()}</b></font>", body_style),
        ],
        [
            Paragraph("<b>Confidence:</b>", body_style),
            Paragraph(f"{confidence:.1f}% ({confidence_level.upper()})", body_style),
            Paragraph("<b>Model Version:</b>", body_style),
            Paragraph(settings.model_version, body_style),
        ]
    ]

    t_meta = Table(meta_data, colWidths=[90, 180, 90, 180])
    t_meta.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f3f4f6")),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 14))

    # 3. Leaf Specimen Image (if exists)
    if image_path and os.path.exists(image_path):
        try:
            story.append(Paragraph("SPECIMEN IMAGE", section_title))
            rl_img = RLImage(image_path, width=180, height=180)
            rl_img.hAlign = "CENTER"
            story.append(rl_img)
            story.append(Spacer(1, 10))
        except Exception:
            pass

    # 4. Diagnostic Analysis
    story.append(Paragraph("01. PATHOLOGY ANALYSIS", section_title))
    story.append(Paragraph(analysis_text, body_style))
    story.append(Spacer(1, 12))

    # 5. Agronomic Recommendations
    story.append(Paragraph("02. ACTIONABLE TREATMENT & MANAGEMENT PROTOCOLS", section_title))
    rec_table_data = []
    for idx, rec in enumerate(recommendations, start=1):
        rec_table_data.append([
            Paragraph(f"<b>{idx}.</b>", body_style),
            Paragraph(rec, body_style)
        ])

    t_rec = Table(rec_table_data, colWidths=[20, 520])
    t_rec.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t_rec)
    story.append(Spacer(1, 16))

    # 6. Disclaimer & Regulatory Compliance
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#9ca3af"), spaceBefore=6, spaceAfter=8))
    disclaimer_text = (
        "<b>Important Agronomic Notice:</b> AgroDoc is an AI-powered screening decision-support aid. "
        "Diagnostic findings should be confirmed by a certified agronomist or extension specialist before "
        "initiating chemical interventions. Always review and adhere strictly to product labels, pre-harvest intervals, "
        "and local environmental regulations."
    )
    story.append(Paragraph(disclaimer_text, disclaimer_style))

    doc.build(story)
    return pdf_filepath
