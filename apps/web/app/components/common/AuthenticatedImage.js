'use client';

import { useEffect, useState } from 'react';

const currentToken = () => {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('teacher_notebook_token_v1')
    || localStorage.getItem('teacher_notebook_token_v1')
    || '';
};

export function AuthenticatedImage({ src, alt = '', fallback = null, ...imageProps }) {
  const [blobUrl, setBlobUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const raw = String(src || '').trim();
    setFailed(false);
    if (!raw) {
      setBlobUrl('');
      return undefined;
    }
    if (/^(blob:|data:)/i.test(raw)) {
      setBlobUrl(raw);
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl = '';
    const token = currentToken();
    fetch(raw, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setFailed(true);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (failed || !blobUrl) return fallback;
  return <img src={blobUrl} alt={alt} {...imageProps} />;
}
