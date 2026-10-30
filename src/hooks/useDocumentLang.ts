/**
 * Keeps `document.documentElement.lang` in sync with the active UI locale.
 *
 * Screen readers pronounce text using the rules of the document's declared
 * language. The `<html lang>` attribute is set to `en` in `index.html`
 * (good enough for the initial paint), but once the app mounts the user's
 * chosen locale should win so the SR uses Norwegian pronunciation for the
 * Norwegian strings, Chinese pronunciation for the Chinese strings, etc.
 *
 * Mount this hook once near the app root.
 */

import {useEffect} from 'react';
import {useAppSelector} from '../store/hooks';

export function useDocumentLang() {
  const locale = useAppSelector(s => s.config.language);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
}
