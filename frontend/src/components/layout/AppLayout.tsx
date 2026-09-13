import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Drawer, useMediaQuery, useTheme } from '@mui/material';
import { SidebarContent } from './Sidebar';
import { Header } from './Header';
import { MobileBottomBar } from './MobileBottomBar';

export const AppLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));

  const handleDrawerToggle = () => {
    setMobileOpen((value) => !value);
  };

  return (
    <div
      dir="rtl"
      style={{
        display: 'flex',
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#F8FAFC',
        overflowX: 'hidden',
      }}
    >
      {/* Desktop: navigation remains on the right and has a stable visual width. */}
      {isDesktop ? (
        <aside
          aria-label="القائمة الرئيسية"
          style={{
            width: desktopCollapsed ? 78 : 292,
            flex: '0 0 auto',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflow: 'hidden',
            borderLeft: '1px solid #E2E8F0',
            backgroundColor: '#FFFFFF',
            boxSizing: 'border-box',
            transition: 'width 180ms ease',
            zIndex: 110,
          }}
        >
          <SidebarContent
            collapsed={desktopCollapsed}
            onToggleCollapse={() => setDesktopCollapsed((value) => !value)}
          />
        </aside>
      ) : (
        <Drawer
          variant="temporary"
          anchor="right"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true, disableRestoreFocus: true }}
          PaperProps={{
            style: {
              width: 'min(292px, 88vw)',
              maxWidth: '100vw',
              backgroundColor: '#FFFFFF',
              borderLeft: '1px solid #E2E8F0',
            },
          }}
        >
          <SidebarContent onItemClick={() => setMobileOpen(false)} />
        </Drawer>
      )}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflowX: 'hidden',
        }}
      >
        <Header onMobileMenuToggle={handleDrawerToggle} />
        <main
          style={{
            flex: 1,
            width: '100%',
            maxWidth: '1600px',
            margin: '0 auto',
            boxSizing: 'border-box',
            paddingBottom: isDesktop ? 0 : 'calc(56px + env(safe-area-inset-bottom, 0px) + 12px)',
          }}
        >
          <Outlet />
        </main>
      </div>

      {!isDesktop && <MobileBottomBar />}
    </div>
  );
};
