import React from 'react';
import ReactDOM, { createRoot, type Root } from 'react-dom/client';
import { setTwoToneColor } from '@ant-design/icons';
import { ConfigProvider, unstableSetRender } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { queryClient } from './shared/query/queryClient';
import { portalPalette, portalTheme } from './shared/theme/portalTheme';
import './styles.css';

setTwoToneColor([portalPalette.primary, portalPalette.twoToneSecondary]);

dayjs.locale('ru');

// antd static message/notification render into a DocumentFragment.
// React 19 createRoot accepts only a real element, so those notices never appear.
type NoticeContainer = ParentNode & {
  _reactRoot?: Root;
  _reactHost?: HTMLElement;
};

unstableSetRender((node, container) => {
  const target = container as NoticeContainer;
  let host: HTMLElement;
  if (container instanceof Element) {
    host = container as HTMLElement;
  } else if (target._reactHost) {
    host = target._reactHost;
  } else {
    host = document.createElement('div');
    document.body.appendChild(host);
    target._reactHost = host;
  }
  const root = target._reactRoot ?? createRoot(host);
  target._reactRoot = root;
  root.render(node);
  return () =>
    new Promise<void>((resolve) => {
      setTimeout(() => {
        root.unmount();
        if (!(container instanceof Element)) host.remove();
        delete target._reactRoot;
        delete target._reactHost;
        resolve();
      }, 0);
    });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={ruRU}
      theme={portalTheme}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
