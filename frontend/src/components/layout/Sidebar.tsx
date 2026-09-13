import React, { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { roleIdentity } from '../ui/roles';

/**
 * Role-scoped navigation. Desktop navigation is intentionally organized into
 * collapsible sections so long hospital/cluster menus stay readable.
 */
export const SidebarContent: React.FC<{
  onItemClick?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}> = ({ onItemClick, collapsed = false, onToggleCollapse }) => {
  const { user, primaryRole, hasAnyCapability } = useAuth();
  const identity = roleIdentity(primaryRole);
  const RoleIcon = identity.icon;

  const sections = useMemo(
    () =>
      identity.nav
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) => !item.requires || item.requires.length === 0 || hasAnyCapability(item.requires),
          ),
        }))
        .filter((section) => section.items.length > 0),
    [identity.nav, hasAnyCapability],
  );

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const isSectionOpen = (title: string) => openSections[title] ?? true;
  const toggleSection = (title: string) => {
    setOpenSections((current) => ({ ...current, [title]: !isSectionOpen(title) }));
  };

  const CollapseIcon = collapsed ? ChevronLeft : ChevronRight;

  return (
    <div
      dir="rtl"
      style={{
        width: '100%',
        height: '100%',
        background: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar header */}
      <div
        style={{
          flexShrink: 0,
          padding: collapsed ? '14px 8px' : '14px 14px 12px',
          borderBottom: '1px solid #E2E8F0',
          background: '#FFFFFF',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              flexShrink: 0,
              background: `linear-gradient(135deg, ${identity.accent} 0%, ${identity.accent}CC 100%)`,
              display: 'grid',
              placeItems: 'center',
              boxShadow: `0 4px 12px ${identity.accent}25`,
            }}
            title="مِران"
          >
            <span style={{ fontWeight: 900, fontSize: 18, color: '#FFFFFF' }}>مِ</span>
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0, textAlign: 'right' }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#0F172A', lineHeight: 1.25 }}>
                مِران
              </div>
              <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, marginTop: 2 }}>
                منصة التدريب الصحي الوطنية
              </div>
            </div>
          )}
        </div>

        {!collapsed ? (
          <div
            style={{
              marginTop: 12,
              padding: '10px 11px',
              borderRadius: 11,
              background: identity.accentSoft,
              border: `1px solid ${identity.accent}24`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <RoleIcon size={15} color={identity.accent} />
              <span style={{ fontSize: 12, fontWeight: 850, color: identity.accent }}>
                {identity.label}
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#64748B', lineHeight: 1.45, marginTop: 3 }}>
              {identity.tagline}
            </div>
            {user?.activeOrganization?.nameAr && (
              <div
                style={{
                  marginTop: 7,
                  paddingTop: 7,
                  borderTop: `1px solid ${identity.accent}18`,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: '#475569',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={user.activeOrganization.nameAr}
              >
                {user.activeOrganization.nameAr}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '11px 0 2px' }} title={identity.label}>
            <RoleIcon size={19} color={identity.accent} />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav
        aria-label="القائمة الرئيسية"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: collapsed ? '10px 7px' : '10px 10px 12px',
          scrollbarWidth: 'thin',
        }}
      >
        {!collapsed && (
          <div
            style={{
              padding: '0 7px 7px',
              fontSize: 9.5,
              fontWeight: 800,
              color: '#94A3B8',
              letterSpacing: '0.4px',
            }}
          >
            التنقل السريع
          </div>
        )}

        {sections.map((section) => {
          const open = isSectionOpen(section.title);
          return (
            <div key={section.title} style={{ marginBottom: collapsed ? 7 : 9 }}>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  aria-expanded={open}
                  style={{
                    width: '100%',
                    minHeight: 31,
                    border: 0,
                    background: 'transparent',
                    padding: '4px 7px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    cursor: 'pointer',
                    color: '#64748B',
                    fontFamily: 'inherit',
                    fontSize: 10.5,
                    fontWeight: 850,
                    textAlign: 'right',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span
                      style={{
                        width: 3,
                        height: 15,
                        borderRadius: 4,
                        background: identity.accent,
                        opacity: 0.65,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {section.title}
                    </span>
                    <span
                      style={{
                        minWidth: 18,
                        height: 18,
                        padding: '0 5px',
                        borderRadius: 9,
                        background: '#F1F5F9',
                        color: '#64748B',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9,
                        fontWeight: 800,
                      }}
                    >
                      {section.items.length}
                    </span>
                  </span>
                  <ChevronDown
                    size={14}
                    style={{
                      flexShrink: 0,
                      transition: 'transform 160ms ease',
                      transform: open ? 'rotate(0deg)' : 'rotate(90deg)',
                    }}
                  />
                </button>
              )}

              {(collapsed || open) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={`${item.path}:${item.name}`}
                        to={item.path}
                        end={item.path === '/'}
                        onClick={onItemClick}
                        title={collapsed ? item.name : undefined}
                        style={({ isActive }) => ({
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: collapsed ? 'center' : 'flex-start',
                          gap: 10,
                          minHeight: 42,
                          padding: collapsed ? '9px 7px' : '8px 10px 8px 11px',
                          borderRadius: 9,
                          color: isActive ? identity.accent : '#475569',
                          background: isActive ? identity.accentSoft : 'transparent',
                          border: `1px solid ${isActive ? `${identity.accent}2E` : 'transparent'}`,
                          textDecoration: 'none',
                          fontSize: 12.25,
                          lineHeight: 1.35,
                          fontWeight: isActive ? 800 : 650,
                          transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
                        })}
                      >
                        {({ isActive }: { isActive: boolean }) => (
                          <>
                            {isActive && !collapsed && (
                              <span
                                aria-hidden="true"
                                style={{
                                  position: 'absolute',
                                  right: -1,
                                  top: 7,
                                  bottom: 7,
                                  width: 3,
                                  borderRadius: '4px 0 0 4px',
                                  background: identity.accent,
                                }}
                              />
                            )}
                            <Icon
                              size={17}
                              style={{
                                color: isActive ? identity.accent : '#94A3B8',
                                flexShrink: 0,
                              }}
                            />
                            {!collapsed && (
                              <span
                                style={{
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {item.name}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse control */}
      {onToggleCollapse && (
        <div style={{ flexShrink: 0, padding: collapsed ? '8px 7px 10px' : '8px 10px 10px', borderTop: '1px solid #E2E8F0' }}>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
            title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
            style={{
              width: '100%',
              minHeight: 40,
              border: '1px solid #E2E8F0',
              borderRadius: 9,
              background: '#F8FAFC',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 750,
              fontSize: 11.5,
            }}
          >
            <CollapseIcon size={17} />
            {!collapsed && 'طي القائمة'}
          </button>
        </div>
      )}
    </div>
  );
};

export const Sidebar: React.FC = () => <SidebarContent />;
