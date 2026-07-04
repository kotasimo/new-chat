import { AppSidebar } from "@/components/app-sidebar";

type SitePageProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export function SitePage({ title, description, children }: SitePageProps) {
  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="site-page">
        <header className="site-page-header">
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        <div className="site-page-body">{children}</div>
      </main>
    </div>
  );
}
