import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  direction: 'rtl',
  palette: { mode: 'light', primary: { main: '#0F766E', light: '#14B8A6', dark: '#0D9488', contrastText: '#fff' }, secondary: { main: '#14B8A6', light: '#2DD4BF', dark: '#0F766E', contrastText: '#fff' }, background: { default: '#F8FAFC', paper: '#fff' }, text: { primary: '#0F172A', secondary: '#64748B' }, divider: '#E2E8F0' },
  typography: {
    fontFamily: ['Cairo', 'system-ui', '-apple-system', 'sans-serif'].join(','),
    h1: { fontWeight: 800, fontSize: 'clamp(1.75rem, 3vw, 2.25rem)', lineHeight: 1.25 }, h2: { fontWeight: 700, fontSize: 'clamp(1.5rem, 2.5vw, 1.875rem)', lineHeight: 1.3 }, h3: { fontWeight: 700, fontSize: 'clamp(1.25rem, 2vw, 1.5rem)', lineHeight: 1.35 }, h4: { fontWeight: 700, fontSize: 'clamp(1.1rem, 1.8vw, 1.25rem)', lineHeight: 1.4 }, h5: { fontWeight: 600, fontSize: '1rem', lineHeight: 1.4 }, h6: { fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.4 }, body1: { fontSize: '0.875rem', lineHeight: 1.5 }, body2: { fontSize: '0.8125rem', lineHeight: 1.5 }, button: { fontWeight: 700, fontSize: '0.8125rem' },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: { styleOverrides: { html: { direction: 'rtl' }, body: { direction: 'rtl', textAlign: 'right', backgroundColor: '#F8FAFC' }, '#root': { direction: 'rtl', textAlign: 'right' }, '*': { boxSizing: 'border-box' } } },
    MuiButton: { styleOverrides: { root: { textTransform: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, minHeight: 36, padding: '6px 14px', boxShadow: 'none', fontFamily: 'inherit', transition: 'all .15s ease', '&:hover': { boxShadow: '0 2px 8px rgba(15,118,110,.15)' } }, sizeSmall: { minHeight: 32, padding: '4px 10px', fontSize: 12 }, sizeLarge: { minHeight: 40, padding: '8px 18px', fontSize: 14 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none', backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04),0 1px 2px rgba(0,0,0,.02)' } } },
    MuiCard: { styleOverrides: { root: { borderRadius: 12, backgroundColor: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,.04),0 1px 2px rgba(0,0,0,.02)' } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 14, margin: 12, width: 'min(calc(100vw - 24px), 1200px)', maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100vh - 24px)', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,.1),0 10px 10px -5px rgba(0,0,0,.04)' }, paperWidthSm: { width: 'min(calc(100vw - 24px), 640px)' }, paperWidthMd: { width: 'min(calc(100vw - 24px), 900px)' }, paperWidthLg: { width: 'min(calc(100vw - 24px), 1200px)' } } },
    MuiDialogTitle: { styleOverrides: { root: { padding: '16px 20px', fontSize: 16, fontWeight: 800, borderBottom: '1px solid #F1F5F9', textAlign: 'right', direction: 'rtl' } } },
    MuiDialogContent: { styleOverrides: { root: { padding: '16px 20px', overflowX: 'auto', direction: 'rtl', textAlign: 'right' } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '12px 20px', gap: 8, borderTop: '1px solid #F1F5F9', flexWrap: 'wrap', direction: 'rtl' } } },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 8, padding: 6, transition: 'all .15s ease' }, sizeSmall: { padding: 4 } } },
    MuiTab: { styleOverrides: { root: { minHeight: 42, fontSize: 13, fontWeight: 700, padding: '8px 14px', textTransform: 'none', fontFamily: 'inherit', direction: 'rtl' } } },
    MuiTableContainer: { styleOverrides: { root: { width: '100%', maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', direction: 'rtl' } } },
    MuiTable: { styleOverrides: { root: { minWidth: 760, tableLayout: 'auto', direction: 'rtl' } } },
    MuiTableHead: { styleOverrides: { root: { direction: 'rtl' } } },
    MuiTableBody: { styleOverrides: { root: { direction: 'rtl' } } },
    MuiTableRow: { styleOverrides: { root: { direction: 'rtl', '&:last-child td,&:last-child th': { borderBottom: 0 } } } },
    MuiTableCell: { styleOverrides: { root: { borderColor: '#F1F5F9', padding: '10px 14px', fontSize: 13, whiteSpace: 'nowrap', textAlign: 'right', direction: 'rtl', verticalAlign: 'middle' }, head: { fontWeight: 700, fontSize: 12.5, color: '#475569', backgroundColor: '#F8FAFC', whiteSpace: 'nowrap', textAlign: 'right' } } },
    // DataGrid is configured locally where it is used because @mui/x-data-grid
    // is not a Material UI component key accepted by createTheme's Components type.
    MuiTextField: { defaultProps: { size: 'small' }, styleOverrides: { root: { direction: 'rtl', '& .MuiOutlinedInput-root': { borderRadius: 10, fontSize: 13, direction: 'rtl', textAlign: 'right' } } } },
    MuiFormControl: { defaultProps: { size: 'small' } },
  },
});
