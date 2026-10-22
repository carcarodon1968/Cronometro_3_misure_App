/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { MeasurementRecord, formatTimeParts, formatFlowValue } from '../types/measurement';

export interface ChartPdfOptions {
  type: 'averages' | 'flow';
  title: string;
  categoryFilter: string;
  sessions: MeasurementRecord[];
}

/**
 * Draws a high-resolution linear chart on a canvas and exports a professional PDF report.
 */
export async function exportLinearChartPdf(options: ChartPdfOptions): Promise<void> {
  const { type, title, categoryFilter, sessions } = options;

  if (!sessions || sessions.length === 0) {
    alert('Nessun dato disponibile da esportare.');
    return;
  }

  // Use chronological order (oldest to newest, max 15 sessions for clean spacing)
  const data = [...sessions].reverse().slice(-15);

  // 1. Create off-screen canvas for high-res crisp linear chart (2x scale for 300dpi print sharpness)
  const canvas = document.createElement('canvas');
  const width = 1600;
  const height = 800;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Padding
  const padLeft = 140;
  const padRight = 80;
  const padTop = 100;
  const padBottom = 130;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Title on chart
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title, padLeft, 55);

  ctx.fillStyle = '#64748b';
  ctx.font = '18px sans-serif';
  ctx.fillText(`Filtro Categoria: ${categoryFilter} | Numero sessioni: ${data.length}`, padLeft, 85);

  if (type === 'averages') {
    // -------------------------------------------------------------
    // LINEAR CHART: AVERAGES AND 3 TIMES
    // -------------------------------------------------------------
    const allVals = data.flatMap((d) => [
      d.finalAverage,
      d.time1 || 0,
      d.time2 || 0,
      d.time3 || 0,
    ]).filter((v) => v > 0);

    const minVal = Math.max(0, Math.min(...allVals) * 0.85);
    const maxVal = Math.max(...allVals, 1000) * 1.15;
    const valRange = maxVal - minVal || 1;

    // Draw grid & Y-axis labels
    const ySteps = 5;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#e2e8f0';
    ctx.fillStyle = '#64748b';
    ctx.font = '16px monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= ySteps; i++) {
      const yVal = minVal + (valRange * i) / ySteps;
      const yPos = padTop + chartH - (i / ySteps) * chartH;

      ctx.beginPath();
      ctx.moveTo(padLeft, yPos);
      ctx.lineTo(padLeft + chartW, yPos);
      ctx.stroke();

      const sec = (yVal / 1000).toFixed(2) + 's';
      ctx.fillText(sec, padLeft - 15, yPos + 5);
    }

    // Compute coordinate points
    const pointsAvg: { x: number; y: number; val: number; label: string; cat: string }[] = [];
    const pointsT1: { x: number; y: number }[] = [];
    const pointsT2: { x: number; y: number }[] = [];
    const pointsT3: { x: number; y: number }[] = [];

    const stepX = chartW / Math.max(data.length - 1, 1);

    data.forEach((d, idx) => {
      const x = padLeft + (data.length === 1 ? chartW / 2 : idx * stepX);
      const yAvg = padTop + chartH - ((d.finalAverage - minVal) / valRange) * chartH;
      pointsAvg.push({
        x,
        y: yAvg,
        val: d.finalAverage,
        label: d.label || `#${idx + 1}`,
        cat: d.category || '',
      });

      if (d.time1) {
        const yT1 = padTop + chartH - ((d.time1 - minVal) / valRange) * chartH;
        pointsT1.push({ x, y: yT1 });
      }
      if (d.time2) {
        const yT2 = padTop + chartH - ((d.time2 - minVal) / valRange) * chartH;
        pointsT2.push({ x, y: yT2 });
      }
      if (d.time3) {
        const yT3 = padTop + chartH - ((d.time3 - minVal) / valRange) * chartH;
        pointsT3.push({ x, y: yT3 });
      }
    });

    // Draw individual times lines (subtle dashed/dotted)
    const drawSubLine = (pts: { x: number; y: number }[], color: string) => {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.setLineDash([4, 4]);
      pts.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    };

    drawSubLine(pointsT1, '#94a3b8');
    drawSubLine(pointsT2, '#94a3b8');
    drawSubLine(pointsT3, '#94a3b8');

    // Draw Global Average Benchmark Line
    const globalAvg = data.reduce((acc, curr) => acc + curr.finalAverage, 0) / data.length;
    const globalAvgY = padTop + chartH - ((globalAvg - minVal) / valRange) * chartH;
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#10b981'; // emerald
    ctx.setLineDash([8, 6]);
    ctx.moveTo(padLeft, globalAvgY);
    ctx.lineTo(padLeft + chartW, globalAvgY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Benchmark label
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Media Globale: ${(globalAvg / 1000).toFixed(2)}s`, padLeft + chartW, globalAvgY - 8);

    // Draw Primary Line: Final Average
    if (pointsAvg.length > 1) {
      // Area gradient under the average curve
      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
      grad.addColorStop(0, 'rgba(234, 88, 12, 0.25)'); // orange-600
      grad.addColorStop(1, 'rgba(234, 88, 12, 0.0)');

      ctx.beginPath();
      ctx.moveTo(pointsAvg[0].x, padTop + chartH);
      pointsAvg.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pointsAvg[pointsAvg.length - 1].x, padTop + chartH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Main line stroke
      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ea580c'; // orange-600
      pointsAvg.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    // Draw Data Point Circles and Value Badges for Final Average
    pointsAvg.forEach((p) => {
      // Outer ring
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ea580c';
      ctx.stroke();

      // Numerical Value above point
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      const textVal = (p.val / 1000).toFixed(2) + 's';
      ctx.fillText(textVal, p.x, p.y - 12);
    });

    // Draw X-Axis labels (dates / labels)
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';

    pointsAvg.forEach((p, idx) => {
      const sess = data[idx];
      const dateStr = new Date(sess.createdAt).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
      });
      const timeStr = new Date(sess.createdAt).toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
      });

      ctx.fillText(p.label, p.x, padTop + chartH + 26);
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.fillText(`${dateStr} ${timeStr}`, p.x, padTop + chartH + 46);
      ctx.fillStyle = '#ea580c';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(p.cat, p.x, padTop + chartH + 64);
      ctx.fillStyle = '#334155';
    });

    // Legend at Top Right
    const legX = width - 420;
    const legY = 45;
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.fillRect(legX, legY, 340, 48);
    ctx.strokeRect(legX, legY, 340, 48);

    // Legend item 1: Media
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ea580c';
    ctx.moveTo(legX + 15, legY + 24);
    ctx.lineTo(legX + 45, legY + 24);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(legX + 30, legY + 24, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ea580c';
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Media Finale', legX + 55, legY + 28);

    // Legend item 2: Singoli Tempi
    ctx.beginPath();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#94a3b8';
    ctx.setLineDash([4, 4]);
    ctx.moveTo(legX + 175, legY + 24);
    ctx.lineTo(legX + 205, legY + 24);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#64748b';
    ctx.font = '13px sans-serif';
    ctx.fillText('Singole Misure (1-3)', legX + 215, legY + 28);
  } else {
    // -------------------------------------------------------------
    // LINEAR CHART: FLOW RATE (L/s & m³/h)
    // -------------------------------------------------------------
    const flows = data.map((d) => d.flowRatePerSec || 0);
    const minVal = 0;
    const maxVal = Math.max(...flows, 1) * 1.25;
    const valRange = maxVal - minVal || 1;

    // Y-Axis
    const ySteps = 5;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#e2e8f0';
    ctx.fillStyle = '#64748b';
    ctx.font = '16px monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= ySteps; i++) {
      const yVal = minVal + (valRange * i) / ySteps;
      const yPos = padTop + chartH - (i / ySteps) * chartH;

      ctx.beginPath();
      ctx.moveTo(padLeft, yPos);
      ctx.lineTo(padLeft + chartW, yPos);
      ctx.stroke();

      const label = yVal.toFixed(2) + ' L/s';
      ctx.fillText(label, padLeft - 15, yPos + 5);
    }

    const stepX = chartW / Math.max(data.length - 1, 1);
    const pointsFlow: { x: number; y: number; val: number; label: string; cat: string }[] = [];

    data.forEach((d, idx) => {
      const x = padLeft + (data.length === 1 ? chartW / 2 : idx * stepX);
      const flow = d.flowRatePerSec || 0;
      const yFlow = padTop + chartH - ((flow - minVal) / valRange) * chartH;
      pointsFlow.push({
        x,
        y: yFlow,
        val: flow,
        label: d.label || `#${idx + 1}`,
        cat: d.category || '',
      });
    });

    // Global Average Flow Line
    const validFlows = flows.filter((f) => f > 0);
    const avgFlow = validFlows.length > 0 ? validFlows.reduce((a, b) => a + b, 0) / validFlows.length : 0;
    const avgFlowY = padTop + chartH - ((avgFlow - minVal) / valRange) * chartH;

    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ea580c';
    ctx.setLineDash([8, 6]);
    ctx.moveTo(padLeft, avgFlowY);
    ctx.lineTo(padLeft + chartW, avgFlowY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#c2410c';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Media Portata: ${avgFlow.toFixed(2)} L/s`, padLeft + chartW, avgFlowY - 8);

    // Area Gradient under Flow Line
    if (pointsFlow.length > 1) {
      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
      grad.addColorStop(0, 'rgba(14, 165, 233, 0.25)'); // sky-500
      grad.addColorStop(1, 'rgba(14, 165, 233, 0.0)');

      ctx.beginPath();
      ctx.moveTo(pointsFlow[0].x, padTop + chartH);
      pointsFlow.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pointsFlow[pointsFlow.length - 1].x, padTop + chartH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Main line stroke
      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0284c7'; // sky-600
      pointsFlow.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    // Points and numerical labels
    pointsFlow.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0284c7';
      ctx.stroke();

      ctx.fillStyle = '#0369a1';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${p.val.toFixed(2)} L/s`, p.x, p.y - 12);
    });

    // X-Axis labels
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';

    pointsFlow.forEach((p, idx) => {
      const sess = data[idx];
      const dateStr = new Date(sess.createdAt).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
      });
      const timeStr = new Date(sess.createdAt).toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
      });

      ctx.fillText(p.label, p.x, padTop + chartH + 26);
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.fillText(`${dateStr} ${timeStr}`, p.x, padTop + chartH + 46);
      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(p.cat, p.x, padTop + chartH + 64);
      ctx.fillStyle = '#334155';
    });
  }

  // Convert canvas to high-res PNG image
  const chartImgData = canvas.toDataURL('image/png', 1.0);

  // -------------------------------------------------------------
  // 2. GENERATE PDF WITH jsPDF (A4 Landscape for optimal chart display)
  // -------------------------------------------------------------
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 14;

  // Header Bar
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 20, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('CRONOMETRO 3 MISURE', margin, 13);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  const genDateStr = new Date().toLocaleString('it-IT');
  doc.text(`Report Tecnico Grafico Lineare | Data: ${genDateStr}`, pageWidth - margin, 13, {
    align: 'right',
  });

  // Report Title & Meta
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, margin, 30);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Filtro Categoria: ${categoryFilter}   |   Sessioni Analizzate: ${data.length}   |   Formato: Grafico di Regressione Lineare`,
    margin,
    36
  );

  // Insert the rendered Linear Chart Image
  const imgW = pageWidth - margin * 2;
  const imgH = 92;
  doc.addImage(chartImgData, 'PNG', margin, 40, imgW, imgH);

  // Table Section Title
  const tableStartY = 138;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Riepilogo Dettagliato delle Misurazioni:', margin, tableStartY);

  // Data Table Headers
  const colX = [margin, margin + 8, margin + 40, margin + 70, margin + 105, margin + 135, margin + 165, margin + 195, margin + 230];
  const tableHeaderY = tableStartY + 5;
  
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(margin, tableHeaderY - 4, pageWidth - margin * 2, 7, 'F');
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);

  doc.text('#', colX[0] + 1, tableHeaderY);
  doc.text('Data / Ora', colX[1], tableHeaderY);
  doc.text('Categoria', colX[2], tableHeaderY);
  doc.text('Etichetta', colX[3], tableHeaderY);
  doc.text('1° Dato', colX[4], tableHeaderY);
  doc.text('2° Dato', colX[5], tableHeaderY);
  doc.text('3° Dato', colX[6], tableHeaderY);
  doc.text('Media Finale', colX[7], tableHeaderY);
  doc.text('Portata (L/s - m³/h)', colX[8], tableHeaderY);

  // Data Table Rows (show up to 10 rows in single page)
  let rowY = tableHeaderY + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  const displayData = data.slice(-8); // Fit neatly on first page

  displayData.forEach((row, i) => {
    doc.setTextColor(71, 85, 105);

    const dStr = new Date(row.createdAt).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const t1 = row.time1 ? formatTimeParts(row.time1).full : '-';
    const t2 = row.time2 ? formatTimeParts(row.time2).full : '-';
    const t3 = row.time3 ? formatTimeParts(row.time3).full : '-';
    const avg = formatTimeParts(row.finalAverage).full;
    const flow = row.flowRatePerSec
      ? `${formatFlowValue(row.flowRatePerSec)} L/s (${(row.flowRatePerSec * 3.6).toFixed(2)} m³/h)`
      : '-';

    doc.text(String(i + 1), colX[0] + 1, rowY);
    doc.text(dStr, colX[1], rowY);
    doc.text(row.category || '-', colX[2], rowY);
    doc.text((row.label || '-').substring(0, 18), colX[3], rowY);
    doc.text(t1, colX[4], rowY);
    doc.text(t2, colX[5], rowY);
    doc.text(t3, colX[6], rowY);

    // Bold highlight for Final Average
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(234, 88, 12);
    doc.text(avg, colX[7], rowY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(14, 116, 144);
    doc.text(flow, colX[8], rowY);

    rowY += 5;
  });

  // Footer & Disclaimer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Documento generato dall\'applicazione Cronometro 3 Misure - Grafico Lineare conforme per verifiche di portata e collaudi.',
    margin,
    pageHeight - 7
  );
  doc.text(`Pagina 1 di 1`, pageWidth - margin, pageHeight - 7, { align: 'right' });

  // Save the PDF
  const filename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
