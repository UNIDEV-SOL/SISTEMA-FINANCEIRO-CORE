import Handlebars from "handlebars";

/** Templates em TypeScript para irem no build sem passos extra de cópia. */

const layout = Handlebars.compile(`<!doctype html>
<html lang="pt">
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
    <p style="margin:0 0 16px">Olá, {{name}}.</p>
    {{{body}}}
    <p style="margin:24px 0 0;font-size:12px;color:#71717a">Recebe este email porque o activou nas definições de alertas. Pode desligá-lo a qualquer momento.</p>
  </div>
</body>
</html>`);

const alertsBody = Handlebars.compile(`
<p style="margin:0 0 16px">{{intro}}</p>
{{#each alerts}}
<div style="border-left:4px solid {{color}};padding:8px 12px;margin:0 0 12px;background:#fafafa">
  <strong>{{title}}</strong><br><span style="font-size:14px">{{message}}</span>
</div>
{{/each}}`);

const summaryBody = Handlebars.compile(`
<h2 style="margin:0 0 16px;font-size:18px">{{heading}}</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px">
  {{#each rows}}
  <tr><td style="padding:6px 0;border-bottom:1px solid #e4e4e7">{{label}}</td><td style="padding:6px 0;border-bottom:1px solid #e4e4e7;text-align:right"><strong>{{value}}</strong></td></tr>
  {{/each}}
</table>
{{#if categories.length}}
<h3 style="margin:20px 0 8px;font-size:15px">Onde gastou mais</h3>
<table style="width:100%;border-collapse:collapse;font-size:14px">
  {{#each categories}}
  <tr><td style="padding:4px 0">{{name}}</td><td style="padding:4px 0;text-align:right">{{value}}</td></tr>
  {{/each}}
</table>
{{/if}}
{{#each notes}}<p style="margin:12px 0 0;font-size:14px">{{this}}</p>{{/each}}`);

const SEVERITY_COLORS = { critical: "#dc2626", warning: "#d97706", info: "#2563eb" };

export function alertsEmail(name: string, alerts: { severity: keyof typeof SEVERITY_COLORS; title: string; message: string }[]) {
  const intro = alerts.length === 1 ? "Há um assunto que merece a sua atenção:" : `Há ${alerts.length} assuntos que merecem a sua atenção:`;
  const body = alertsBody({ intro, alerts: alerts.map((a) => ({ ...a, color: SEVERITY_COLORS[a.severity] })) });
  return layout({ name, body });
}

export function summaryEmail(
  name: string,
  data: { heading: string; rows: { label: string; value: string }[]; categories: { name: string; value: string }[]; notes: string[] },
) {
  return layout({ name, body: summaryBody(data) });
}
