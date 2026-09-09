export const decodeBrokenKorean = (name) => String(name || '');

export const fileExt = (name) => {
  const normalized = String(name || '').toLowerCase();
  const index = normalized.lastIndexOf('.');
  return index >= 0 ? normalized.slice(index + 1) : '';
};

export const fileNameWithoutExt = (name) => {
  const normalized = String(name || '');
  const index = normalized.lastIndexOf('.');
  return index >= 0 ? normalized.slice(0, index) : normalized;
};

export const fileTypeMeta = (item) => {
  const ext = fileExt(item?.name);

  if (['xlsx', 'xls', 'csv'].includes(ext)) return { icon: '📗', label: 'Excel', bg: '#ecfdf3', color: '#166534' };
  if (['ppt', 'pptx'].includes(ext)) return { icon: '📙', label: 'PowerPoint', bg: '#fff7ed', color: '#c2410c' };
  if (['doc', 'docx'].includes(ext)) return { icon: '📘', label: 'Word', bg: '#eff6ff', color: '#1d4ed8' };
  if (['hwp', 'hwpx'].includes(ext)) return { icon: '🟦', label: '한글', bg: '#eef2ff', color: '#4338ca' };
  if (['pdf'].includes(ext)) return { icon: '📕', label: 'PDF', bg: '#fef2f2', color: '#b91c1c' };
  if (['zip', 'rar', '7z', 'alz', 'tar', 'gz'].includes(ext)) return { icon: '🗜️', label: '압축', bg: '#f8fafc', color: '#334155' };
  if (['wmv', 'mp4', 'mov', 'mkv', 'avi', 'm4v'].includes(ext)) return { icon: '🎬', label: '동영상', bg: '#f1f5f9', color: '#334155' };
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return { icon: '🔊', label: '오디오', bg: '#f8fafc', color: '#334155' };
  if (['txt', 'md', 'rtf'].includes(ext)) return { icon: '📄', label: '문서', bg: '#f8fafc', color: '#334155' };

  return { icon: '📁', label: ext ? ext.toUpperCase() : '기타', bg: '#f8fafc', color: '#334155' };
};
