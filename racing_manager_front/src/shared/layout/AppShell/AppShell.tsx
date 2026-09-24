import { Layout } from 'antd';
import type { PropsWithChildren, ReactNode } from 'react';
import { AppShellFooter } from './components/AppShellFooter';
import { AppShellHeader } from './components/AppShellHeader';
import { AppSiderMenu } from './components/AppSiderMenu';

const { Content } = Layout;

type AppShellProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  extra?: ReactNode;
}>;

export function AppShell({ title, subtitle, extra, children }: AppShellProps) {
  return (
    <Layout hasSider style={{ minHeight: '100vh' }}>
      <AppSiderMenu />
      <Layout>
        <AppShellHeader title={title} subtitle={subtitle} extra={extra} />
        <Content className="app-content">{children}</Content>
        <AppShellFooter />
      </Layout>
    </Layout>
  );
}
