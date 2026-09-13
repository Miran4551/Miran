import React, { useEffect } from 'react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

// Keep the document direction explicit so generated MUI/Emotion components
// inherit the same Arabic-first direction as the application theme.
const cacheRtl = createCache({
  key: 'muirtl',
  stylisPlugins: [prefixer, rtlPlugin],
});

interface RtlProviderProps {
  children: React.ReactNode;
}

export const RtlProvider: React.FC<RtlProviderProps> = ({ children }) => {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlDir = html.getAttribute('dir');
    const previousBodyDir = body.getAttribute('dir');

    html.setAttribute('dir', 'rtl');
    body.setAttribute('dir', 'rtl');

    return () => {
      if (previousHtmlDir === null) html.removeAttribute('dir');
      else html.setAttribute('dir', previousHtmlDir);
      if (previousBodyDir === null) body.removeAttribute('dir');
      else body.setAttribute('dir', previousBodyDir);
    };
  }, []);

  return <CacheProvider value={cacheRtl}>{children}</CacheProvider>;
};
