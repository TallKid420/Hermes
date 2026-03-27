// Utility functions for Hermes Remote UI

window.HermesUtils = {
  attachmentKey: (file) => {
    return `${file.name}:${file.size}:${file.lastModified}`;
  },

  nowTime: () => {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  },

  wait: (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  escapeHtml: (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  downloadTextFile: (content, filename) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  extensionForLanguage: (lang) => {
    const map = {
      python: 'py',
      javascript: 'js',
      typescript: 'ts',
      html: 'html',
      css: 'css',
      json: 'json',
      bash: 'sh',
      sql: 'sql',
    };
    return map[lang] || 'txt';
  },

  buildProgressPhrases: () => {
    return [
      'Polling device...',
      'Processing request...',
      'Executing command...',
      'Please wait...',
    ];
  },

  startProgressTicker: (phrases, callback) => {
    let index = 0;
    const interval = setInterval(() => {
      callback(phrases[index % phrases.length]);
      index++;
    }, 400);
    return interval;
  },
};
