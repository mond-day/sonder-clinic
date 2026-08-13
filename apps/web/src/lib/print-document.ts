/**
 * Imprime HTML via iframe oculto.
 * Evita `window.open(..., 'noopener')`, que retorna null e impede escrever o documento.
 */
export function printHtmlDocument(html: string, title = 'Impressão') {
  if (typeof document === 'undefined') return false;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', title);
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument ?? frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    return false;
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  let printed = false;
  const cleanup = () => {
    iframe.remove();
  };

  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      window.setTimeout(cleanup, 1200);
    }
  };

  iframe.addEventListener('load', () => triggerPrint(), { once: true });
  window.setTimeout(triggerPrint, 350);
  return true;
}

export function escapePrintHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function formatPrintTimestamp(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
