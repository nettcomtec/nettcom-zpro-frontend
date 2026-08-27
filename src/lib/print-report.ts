export function printReportTable(opts: {
  title: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
}): boolean {
  const { title, headers, rows } = opts;
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const headHtml = headers.map((h) => `<th>${escape(String(h ?? ""))}</th>`).join("");
  const bodyHtml = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c) => `<td>${escape(String(c ?? ""))}</td>`)
          .join("")}</tr>`
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
@page { size: landscape; margin: 12mm; }
body { font-family: Arial, sans-serif; color: #000; }
h1 { font-size: 16px; margin: 0 0 12px; }
table { width: 100%; border-collapse: collapse; font-size: 10px; }
th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
thead th { background: #eaeaea; font-weight: bold; }
tr:nth-child(even) td { background: #fafafa; }
</style></head><body>
<h1>${escape(title)}</h1>
<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
<script>window.onload=function(){window.print();setTimeout(function(){window.close();},300);};</script>
</body></html>`;
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}
