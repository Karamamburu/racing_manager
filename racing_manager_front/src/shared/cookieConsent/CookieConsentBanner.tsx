import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as CookieConsent from 'vanilla-cookieconsent';
import 'vanilla-cookieconsent/dist/cookieconsent.css';
import { cookieConsentConfig } from './config';

let consentStarted = false;

export function CookieConsentBanner() {
  const navigate = useNavigate();

  useEffect(() => {
    if (consentStarted) {
      return;
    }

    consentStarted = true;
    void CookieConsent.run(cookieConsentConfig);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('#cc-main a[href^="/"]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      event.preventDefault();
      navigate(anchor.pathname);
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [navigate]);

  return null;
}
