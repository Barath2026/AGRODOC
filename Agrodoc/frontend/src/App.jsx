import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import {
  Activity, AlertCircle, ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight,
  Bell, CalendarDays, Camera, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleHelp, Clock3, CloudUpload, Download, FileText, Filter, Focus, Leaf,
  LocateFixed, Mail, MapPin, Menu, Moon, MoreHorizontal, Navigation, Phone, Plus, Ruler, Search,
  ShieldCheck, Sprout, Sun, Upload, X,
} from 'lucide-react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { analyzeImage, clearAccessToken, createField, createFieldZone, deleteFieldZone, getAccessToken, getCurrentUser, getFieldSummary, getFields, getScanDetails, getScans, login, register, saveAccessToken, submitContactMessage } from './data/api.js';
import { buildReportText, getDiagnosticOutput } from './data/mockService.js';

const navigation = [
  { label: 'Overview', to: '/', icon: Activity },
  { label: 'New scan', to: '/scan', icon: Focus },
  { label: 'Scan history', to: '/history', icon: Clock3 },
  { label: 'Reports', to: '/reports', icon: FileText },
];

const initialFields = [{ id: 'north-field', name: 'North Field', plants: 10, location: 'North Field · Greenhouse block', registeredZones: 6, monitoredZones: 4, totalArea: null, scannedArea: null }];
const fieldStorageKey = 'agrodoc.fields.v1';
const activeWorkspaceStorageKey = 'agrodoc.active-workspace.v1';
const zoneDetailsStorageKey = 'agrodoc.zone-details.v1';

function getZoneDetails(fieldId) {
  try {
    const details = JSON.parse(window.localStorage.getItem(zoneDetailsStorageKey) || '{}');
    return details[fieldId] || {};
  } catch {
    return {};
  }
}

function saveZoneDetails(fieldId, fieldDetails) {
  try {
    const details = JSON.parse(window.localStorage.getItem(zoneDetailsStorageKey) || '{}');
    details[fieldId] = fieldDetails;
    window.localStorage.setItem(zoneDetailsStorageKey, JSON.stringify(details));
  } catch {
    // Polygon geometry remains saved by the backend if local storage is unavailable.
  }
}

function getInitialFields() {
  try {
    const saved = window.localStorage.getItem(fieldStorageKey);
    const parsed = saved ? JSON.parse(saved) : initialFields;
    return Array.isArray(parsed) ? parsed : initialFields;
  } catch {
    return initialFields;
  }
}

function InstallAppButton({ variant = '' }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);

  useEffect(() => {
    function captureInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }
    function markInstalled() {
      setIsInstalled(true);
      setInstallPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    window.addEventListener('appinstalled', markInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
      window.removeEventListener('appinstalled', markInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  if (isInstalled || !installPrompt) return null;
  return <button className={`install-app-button ${variant}`} type="button" onClick={promptInstall}><Download size={14} />Install app</button>;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getAccessToken()));
  const [landingTheme, setLandingTheme] = useState(() => {
    try {
      return window.localStorage.getItem('agrodoc.landing.theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [scans, setScans] = useState([]);
  const [activeScan, setActiveScan] = useState(null);
  const [toast, setToast] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => {
    try {
      return window.localStorage.getItem(activeWorkspaceStorageKey) || initialFields[0].id;
    } catch {
      return initialFields[0].id;
    }
  });
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [availableWorkspaces, setAvailableWorkspaces] = useState(getInitialFields);
  const workspacePickerRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!getAccessToken()) return undefined;
    let active = true;
    Promise.all([getCurrentUser(), getScans(), getFields()])
      .then(([, userScans, userFields]) => {
        if (!active) return;
        setScans(userScans);
        setAvailableWorkspaces(userFields);
        if (userFields.length) {
          setActiveWorkspaceId((currentId) => userFields.some((field) => field.id === currentId) ? currentId : userFields[0].id);
        }
      })
      .catch(() => {
        if (!active) return;
        clearAccessToken();
        setIsAuthenticated(false);
        setScans([]);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => setMobileNavOpen(false), [location.pathname]);
  useEffect(() => {
    function closeWorkspaceMenu(event) {
      if (!workspacePickerRef.current?.contains(event.target)) setWorkspaceMenuOpen(false);
    }
    document.addEventListener('pointerdown', closeWorkspaceMenu);
    return () => document.removeEventListener('pointerdown', closeWorkspaceMenu);
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function authenticate({ mode, email, password, name, confirmPassword }) {
    const result = mode === 'signup'
      ? await register({ name, email, password, confirmPassword })
      : await login(email, password);
    saveAccessToken(result.access_token);
    setScans([]);
    setIsAuthenticated(true);
    navigate('/');
    try {
      const [userScans, userFields] = await Promise.all([getScans(), getFields()]);
      setScans(userScans);
      setAvailableWorkspaces(userFields);
      if (userFields.length) {
        setActiveWorkspaceId(userFields[0].id);
        try {
          window.localStorage.setItem(activeWorkspaceStorageKey, userFields[0].id);
        } catch {
          // The active field remains selected for the current session.
        }
      }
    } catch (error) {
      setToast(error.message);
    }
  }

  function signOut() {
    clearAccessToken();
    setIsAuthenticated(false);
    setScans([]);
    navigate('/');
  }

  async function openScanReport(scan) {
    try {
      const details = await getScanDetails(scan.id);
      setActiveScan(details);
      navigate(`/reports/${scan.id}`);
    } catch (error) {
      setToast(error.message);
    }
  }

  function addWorkspace(field) {
    setAvailableWorkspaces((currentFields) => [...currentFields, field]);
    selectWorkspace(field.id);
  }

  function changeLandingTheme(theme) {
    setLandingTheme(theme);
    try {
      window.localStorage.setItem('agrodoc.landing.theme', theme);
    } catch {
      // The theme still changes for the current session when storage is unavailable.
    }
  }

  function toggleWorkspaceMenu() {
    setWorkspaceMenuOpen((isOpen) => !isOpen);
  }

  function selectWorkspace(workspaceId) {
    setActiveWorkspaceId(workspaceId);
    setWorkspaceMenuOpen(false);
    try {
      window.localStorage.setItem(activeWorkspaceStorageKey, workspaceId);
    } catch {
      // Workspace selection still applies for the current session.
    }
  }

  if (!isAuthenticated) {
    const publicPages = { '/': 'home', '/about': 'about', '/testimonial': 'testimonial', '/contact': 'contact', '/explore': 'explore' };
    const page = publicPages[location.pathname];
    return page ? <LoginPage key={location.pathname} page={page} theme={landingTheme} onThemeChange={changeLandingTheme} onAuthenticate={authenticate} /> : <Navigate to="/" replace />;
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`} aria-label="Main navigation">
        <Link className="brand" to="/" aria-label="AgroDoc overview">
          <span className="brand-mark"><Sprout size={21} /></span>
          <span className="brand-name">Agro<span>doc</span><small>FIELD INTELLIGENCE</small></span>
        </Link>
        <div className="workspace-picker" ref={workspacePickerRef}>
          <button className="workspace-select" aria-haspopup="listbox" aria-expanded={workspaceMenuOpen} onClick={toggleWorkspaceMenu}>
            <span className="workspace-icon">{(availableWorkspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name || 'NF').slice(0, 2).toUpperCase()}</span><span className="workspace-meta"><small>My workspace</small><strong>{availableWorkspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name || 'Choose workspace'}</strong></span><ChevronDown className={workspaceMenuOpen ? 'workspace-chevron-open' : ''} size={15} />
          </button>
          {workspaceMenuOpen && <div className="workspace-menu" role="listbox" aria-label="Available workspaces">
            <span className="workspace-menu-label">AVAILABLE WORKSPACES</span>
            {availableWorkspaces.map((workspace) => <button key={workspace.id} className={`workspace-option ${workspace.id === activeWorkspaceId ? 'active' : ''}`} role="option" aria-selected={workspace.id === activeWorkspaceId} onClick={() => selectWorkspace(workspace.id)}>
              <span className="workspace-option-icon">{workspace.name.slice(0, 2).toUpperCase()}</span><span><strong>{workspace.name}</strong><small>{workspace.location}</small></span>{workspace.id === activeWorkspaceId && <Check size={15} />}
            </button>)}
            {!availableWorkspaces.length && <span className="workspace-empty">No workspaces available.</span>}
          </div>}
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav className="primary-nav">
          {navigation.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={18} /><span>{label}</span>{label === 'Scan history' && <span className="nav-count">{scans.length}</span>}</NavLink>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-tip"><span className="tip-icon"><Leaf size={15} /></span><strong>Field note</strong><p>Early scouting can make all the difference. Check lower leaves after rain.</p><Link to="/scan">Start a scan <ArrowRight size={13} /></Link></div>
        <div className="sidebar-footer">
          <button className="profile-button" onClick={signOut} aria-label="Sign out"><span className="avatar">BM</span><span className="profile-name"><strong>Barath</strong><small>Farm manager</small></span><MoreHorizontal size={18} /></button>
        </div>
      </aside>
      {mobileNavOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}

      <div className="app-main">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>{availableWorkspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name || 'My workspace'}</span><ChevronRight size={14} /><strong>{pageTitle(location.pathname)}</strong></div>
          <div className="topbar-actions">
            <form className="global-search" role="search" onSubmit={(event) => { event.preventDefault(); navigate('/history'); }}><Search size={16} /><input aria-label="Search scans" placeholder="Search scans" value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} /><kbd>⌘ K</kbd></form>
            <InstallAppButton variant="workspace-install" />
            <span className="topbar-divider" />
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setToast('You’re all caught up.')}><Bell size={18} /><i /></button>
            <button className="topbar-date" onClick={() => setToast('Showing activity for the last 30 days.')}><CalendarDays size={15} /><span>Oct 4, 2026</span><ChevronDown size={14} /></button>
          </div>
        </header>
        <main id="main-content" className="content-area">
          <Routes>
            <Route path="/" element={<Dashboard scans={scans} fields={availableWorkspaces} activeWorkspaceId={activeWorkspaceId} onWorkspaceChange={selectWorkspace} onFieldCreated={addWorkspace} />} />
            <Route path="/scan" element={<ScanPage fields={availableWorkspaces} activeFieldId={activeWorkspaceId} onResult={(scan) => { setScans((current) => [scan, ...current.filter((item) => item.id !== scan.id)]); setActiveScan(scan); navigate('/scan/result'); }} />} />
            <Route path="/scan/result" element={<ScanResult scan={activeScan} />} />
            <Route path="/history" element={<HistoryPage scans={scans} initialSearch={globalSearch} onOpen={openScanReport} />} />
            <Route path="/reports" element={<ReportsPage scans={scans} />} />
            <Route path="/reports/:id" element={<ReportPage scans={scans} activeScan={activeScan} />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <footer className="app-footer"><span>AGRODOC <i /> FIELD INTELLIGENCE</span><span>Connected workspace <i /> Records saved to your account</span></footer>
      </div>
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15} /></button></div>}
    </div>
  );
}

function pageTitle(path) {
  if (path.startsWith('/history')) return 'Scan history';
  if (path.startsWith('/reports')) return 'Reports';
  if (path.startsWith('/scan')) return 'Crop scan';
  if (path.startsWith('/login')) return 'Welcome';
  return 'Overview';
}

function Heading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

function FieldLocationPicker({ value, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [locationStatus, setLocationStatus] = useState('');

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const map = L.map(containerRef.current).setView(value ? [value.latitude, value.longitude] : [0, 0], value ? 15 : 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.on('click', ({ latlng }) => onSelectRef.current({ latitude: latlng.lat, longitude: latlng.lng }));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !value) return;
    markerRef.current?.remove();
    markerRef.current = L.circleMarker([value.latitude, value.longitude], {
      radius: 9,
      color: '#fff',
      weight: 3,
      fillColor: '#c94638',
      fillOpacity: 1,
    }).addTo(mapRef.current).bindTooltip('Selected field location');
  }, [value]);

  async function searchLocation(event) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.search = new URLSearchParams({ q: query.trim(), format: 'jsonv2', limit: '5' }).toString();
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Location search is unavailable. Try selecting a point on the map.');
      const locations = await response.json();
      setResults(locations);
      if (!locations.length) setError('No matching locations found. Try a nearby town or address.');
    } catch (searchError) {
      setError(searchError.message || 'Could not search locations. Check your connection.');
    } finally {
      setSearching(false);
    }
  }

  function selectResult(result) {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    mapRef.current?.setView([latitude, longitude], 15);
    onSelect({ latitude, longitude, label: result.display_name });
    setQuery(result.display_name);
    setResults([]);
    setError('');
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('Location is not supported by this browser.');
      return;
    }
    setLocationStatus('Getting GPS location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { latitude: coords.latitude, longitude: coords.longitude };
        mapRef.current?.setView([point.latitude, point.longitude], 15);
        onSelect(point);
        setLocationStatus('GPS location selected.');
      },
      (locationError) => setLocationStatus(locationError.code === 1
        ? 'Location permission denied. Select a point on the map instead.'
        : 'GPS location unavailable. Check device location services.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  return <div className="field-location-picker">
    <div className="field-location-tools">
      <div className="field-location-search" role="search">
        <Search size={15} />
        <input aria-label="Search field location" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search town, address, or place" />
        <button className="button button-secondary" type="button" onClick={searchLocation} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
      </div>
      <button className="button button-secondary field-gps-button" type="button" onClick={useCurrentLocation}><LocateFixed size={14} /> Use GPS</button>
    </div>
    {results.length > 0 && <div className="field-location-results" role="listbox" aria-label="Location search results">{results.map((result) => <button key={`${result.place_id}-${result.lat}`} type="button" role="option" onClick={() => selectResult(result)}>{result.display_name}</button>)}</div>}
    <div ref={containerRef} className="field-location-map" aria-label="Select field coordinates on map" />
    <div className="field-location-map-footer"><span>{value ? `Selected · ${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}` : 'Search, use GPS, or click the map to choose a location.'}</span>{locationStatus && <small role="status">{locationStatus}</small>}{error && <small className="field-location-error" role="alert">{error}</small>}</div>
  </div>;
}

function Dashboard({ scans, fields, activeWorkspaceId, onWorkspaceChange, onFieldCreated }) {
  const navigate = useNavigate();
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [detailsFieldId, setDetailsFieldId] = useState(null);
  const [fieldDetails, setFieldDetails] = useState(null);
  const [fieldDetailsLoading, setFieldDetailsLoading] = useState(false);
  const [fieldDetailsError, setFieldDetailsError] = useState('');
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [fieldForm, setFieldForm] = useState({ name: '', plants: '', location: '', area: '' });
  const [fieldPoint, setFieldPoint] = useState(null);
  const [fieldError, setFieldError] = useState('');
  const [creatingField, setCreatingField] = useState(false);
  const healthy = scans.filter((scan) => scan.health === 'Healthy').length;
  const flagged = scans.length - healthy;
  const latest = scans[0];
  const diseaseCounts = scans.filter((scan) => scan.health !== 'Healthy').reduce((all, scan) => ({ ...all, [scan.prediction]: (all[scan.prediction] || 0) + 1 }), {});
  const common = Object.entries(diseaseCounts).sort((a, b) => b[1] - a[1])[0];
  const health = !latest ? 'No recent data' : latest.health === 'Healthy' ? 'Looking healthy' : 'Needs attention';
  const selectedField = fields.find((field) => field.id === activeWorkspaceId) || fields.find((field) => field.id === selectedFieldId) || fields[0];
  const fieldScans = selectedField ? scans.filter((scan) => scan.fieldId === selectedField.id) : [];
  const fieldHealthy = fieldScans.filter((scan) => scan.health === 'Healthy').length;
  const selectedPlantCount = Math.max(Number(selectedField?.plants) || 0, 0);
  const fieldAttention = fieldScans.length && selectedPlantCount > 0 ? Math.round((fieldScans.length - fieldHealthy) / fieldScans.length * selectedPlantCount) : null;
  const fieldHealthyEstimate = fieldAttention === null ? null : selectedPlantCount - fieldAttention;
  const fieldHealth = selectedPlantCount > 0 && fieldHealthyEstimate !== null ? Math.round(fieldHealthyEstimate / selectedPlantCount * 100) : null;
  const scannedLocations = new Set(fieldScans.map((scan) => scan.location)).size;
  const coverage = selectedField?.totalArea > 0
    ? Math.round((selectedField.scannedArea / selectedField.totalArea) * 100)
    : selectedField?.registeredZones ? Math.round((selectedField.monitoredZones / selectedField.registeredZones) * 100) : 0;
  const detailsField = fields.find((field) => field.id === detailsFieldId);

  useEffect(() => {
    if (!detailsFieldId) return undefined;
    let active = true;
    setFieldDetails(null);
    setFieldDetailsError('');
    setFieldDetailsLoading(true);
    getFieldSummary(detailsFieldId)
      .then((summary) => { if (active) setFieldDetails(summary); })
      .catch((error) => { if (active) setFieldDetailsError(error.message); })
      .finally(() => { if (active) setFieldDetailsLoading(false); });
    return () => { active = false; };
  }, [detailsFieldId]);

  function selectFieldOnMap(fieldId) {
    setSelectedFieldId(fieldId);
    onWorkspaceChange(fieldId);
    setDetailsFieldId(fieldId);
  }

  async function addField(event) {
    event.preventDefault();
    if (!fieldPoint) {
      setFieldError('Choose the field location on the map or use GPS.');
      return;
    }
    setCreatingField(true);
    setFieldError('');
    try {
      const newField = await createField({
        name: fieldForm.name.trim(),
        plants: Number(fieldForm.plants),
        location: fieldForm.location.trim(),
        latitude: fieldPoint.latitude,
        longitude: fieldPoint.longitude,
        area: fieldForm.area ? Number(fieldForm.area) : null,
      });
      onFieldCreated(newField);
      setFieldForm({ name: '', plants: '', location: '', area: '' });
      setFieldPoint(null);
      setShowFieldForm(false);
      setSelectedFieldId(newField.id);
    } catch (requestError) {
      setFieldError(requestError.message);
    } finally {
      setCreatingField(false);
    }
  }

  return <div className="page dashboard-page">
    <Heading eyebrow="SUNDAY, OCTOBER 4, 2026" title="Good morning, Barath" description={`Here’s what’s happening across ${selectedField?.name || 'your'} today.`} action={<button className="button button-primary" onClick={() => navigate('/scan')}><Plus size={17} /> New crop scan</button>} />
    <section className="overview-banner">
      <div className="banner-copy"><div className="banner-kicker"><i /> FIELD PULSE <span>·</span> WEEK 40</div><h2>Your crop, at a glance.</h2><p>{selectedField?.monitoredZones || 0} zones monitored across {selectedField?.name || 'your field'}. Keep your scouting rhythm going.</p><Link className="text-link" to="/history">View field activity <ArrowRight size={15} /></Link></div>
      <div className="banner-image" role="img" aria-label="Tomato plant foliage"><div className="image-caption"><span>{selectedField?.name || 'Field'}</span><small>{selectedField?.location || 'Field location not set'}</small></div></div>
      <div className="banner-health"><span className="health-ring"><Leaf size={20} /></span><span className="health-label">LATEST FIELD READ</span><strong>{health}</strong><small>{latest ? `${latest.confidence.toFixed(1)}% sample confidence · ${relativeDate(latest.createdAt)}` : 'Run a scan to get started'}</small></div>
    </section>
    <section className="field-info-section" aria-labelledby="field-info-title">
      <div className="section-heading"><div><span className="eyebrow">FIELD INFORMATION</span><h2 id="field-info-title">Your fields</h2></div><button className="button button-secondary add-field-button" onClick={() => setShowFieldForm(!showFieldForm)}><Plus size={15} /> Add field</button></div>
      {showFieldForm && <form className="field-create-form" onSubmit={addField}>
        <label>Field name<input required value={fieldForm.name} onChange={(event) => setFieldForm({ ...fieldForm, name: event.target.value })} placeholder="e.g. South Field" /></label>
        <label>Number of plants<input required type="number" min="1" step="1" value={fieldForm.plants} onChange={(event) => setFieldForm({ ...fieldForm, plants: event.target.value })} placeholder="e.g. 120" /></label>
        <label>Location description<input required value={fieldForm.location} onChange={(event) => setFieldForm({ ...fieldForm, location: event.target.value })} placeholder="e.g. South block · Rows 1–6" /></label>
        <label>Field area (hectares)<input type="number" min="0.01" step="0.01" value={fieldForm.area} onChange={(event) => setFieldForm({ ...fieldForm, area: event.target.value })} placeholder="Optional" /></label>
        <FieldLocationPicker value={fieldPoint} onSelect={(point) => {
          setFieldPoint({ latitude: point.latitude, longitude: point.longitude });
          if (point.label) setFieldForm((current) => ({ ...current, location: point.label }));
        }} />
        {fieldError && <div className="inline-error" role="alert"><AlertCircle size={15} />{fieldError}</div>}
        <button className="button button-primary" type="submit" disabled={creatingField}>{creatingField ? 'Creating…' : <><Check size={15} /> Create field</>}</button>
      </form>}
      <div className="field-kpi-grid">
        {fields.map((field) => {
          const records = scans.filter((scan) => scan.fieldId === field.id);
          const healthyRecords = records.filter((scan) => scan.health === 'Healthy').length;
          const totalPlants = Math.max(Number(field.plants) || 0, 0);
          const attentionPlants = records.length && totalPlants > 0 ? Math.round((records.length - healthyRecords) / records.length * totalPlants) : null;
          const healthyPlants = attentionPlants === null ? null : totalPlants - attentionPlants;
          const healthPercent = totalPlants > 0 && healthyPlants !== null ? Math.round(healthyPlants / totalPlants * 100) : null;
          const isSelected = field.id === selectedField?.id;
          return <button key={field.id} className={`field-kpi-card ${isSelected ? 'selected' : ''}`} aria-expanded={selectedFieldId === field.id} onClick={() => { setSelectedFieldId(field.id); onWorkspaceChange(field.id); }}>
            <span className="field-card-top"><span className="field-card-icon"><MapPin size={17} /></span><span className="field-location">{field.location}</span><ChevronRight size={16} /></span>
            <strong className="field-card-name">{field.name}</strong>
            <span className="field-card-stats"><span><small>PLANTS</small><b>{totalPlants.toLocaleString()}</b></span><span><small>FIELD HEALTH</small><b>{healthPercent === null ? '—' : `${healthPercent}%`}</b></span><span><small>NEED ATTENTION</small><b>{attentionPlants ?? '—'}</b></span></span>
            <span className="field-card-note">{records.length ? 'Health estimated from field scan samples' : 'No scan data yet'}</span>
          </button>;
        })}
      </div>
      {selectedField && selectedFieldId === selectedField.id && <section className="plant-matrix-panel" aria-label={`${selectedField.name} field health estimate`}>
        <div className="matrix-heading"><div><span className="eyebrow">FIELD HEALTH ESTIMATE</span><h3>{selectedField.name} · {selectedPlantCount.toLocaleString()} plants</h3></div><span className="matrix-legend">{fieldScans.length ? `${fieldScans.length} linked AI scans` : 'No linked scans'}</span></div>
        <div className="field-health-estimate-bar" role="progressbar" aria-label="Estimated healthy plant percentage" aria-valuemin="0" aria-valuemax="100" aria-valuenow={fieldHealth ?? 0}><span style={{ width: `${fieldHealth ?? 0}%` }} /></div>
        <div className="field-health-estimate-totals"><span>Healthy estimate <strong>{fieldHealthyEstimate ?? '—'}</strong></span><span>Needs attention estimate <strong>{fieldAttention ?? '—'}</strong></span><span>Healthy percentage <strong>{fieldHealth === null ? '—' : `${fieldHealth}%`}</strong></span></div>
        <p className="matrix-caption">Counts are estimated by applying linked scan outcomes to the registered plant count; individual plant identities are not recorded.</p>
      </section>}
    </section>
    <section className="metric-grid" aria-label="Field summary">
      <Metric icon={Focus} label="Scans completed" value={scans.length} detail="Across all field zones" trend="+3 this week" tone="green" />
      <Metric icon={ShieldCheck} label="Healthy samples" value={`${scans.length ? Math.round(healthy / scans.length * 100) : 0}%`} detail={`${healthy} of ${scans.length} recent scans`} trend={`${healthy} healthy`} tone="mint" />
      <Metric icon={MapPin} label="Field coverage" value={`${coverage}%`} detail={`${selectedField?.monitoredZones || 0} of ${selectedField?.registeredZones || 0} zones monitored`} trend={`${scannedLocations} scanned locations`} tone="yellow" />
      <Metric icon={AlertCircle} label="Needs attention" value={flagged} detail="Samples flagged for review" trend={flagged ? 'Review scans' : 'All clear'} tone={flagged ? 'coral' : 'mint'} />
    </section>
    <section className="dashboard-main-grid">
      <div className="section-panel activity-panel"><div className="section-heading"><div><span className="eyebrow">FIELD ACTIVITY</span><h2>Recent scans</h2></div><Link className="subtle-link" to="/history">See all <ArrowRight size={14} /></Link></div>
        <div className="scan-list">{scans.slice(0, 4).map((scan) => <ScanRow key={scan.id} scan={scan} compact />)}{!scans.length && <EmptyState icon={Focus} title="No scans yet" body="Start a scan to begin tracking field activity." action={<Link to="/scan" className="button button-secondary">Start your first scan</Link>} />}</div>
      </div>
      <div className="section-panel insight-panel"><div className="section-heading"><div><span className="eyebrow">AGRODOC INSIGHTS</span><h2>What we’re seeing</h2></div><span className="insight-spark"><Activity size={17} /></span></div>
        <div className="chart-summary"><strong>{scans.length ? `${Math.round(healthy / scans.length * 100)}%` : '—'}</strong><span>healthy scan share <small><ArrowUpRight size={12} /> 8.4%</small></span></div><HealthChart />
        <div className="insight-divider" /><div className="insight-note"><span className="note-icon"><Sprout size={16} /></span><div><strong>{common ? `${common[0]} is the most-seen flag` : 'No disease patterns yet'}</strong><p>{common ? `Found in ${common[1]} ${common[1] === 1 ? 'scan' : 'scans'}. Prioritize a visual check in affected zones.` : 'Keep scanning regularly to build a field picture.'}</p></div></div><Link className="insight-action" to="/reports">Explore field reports <ArrowRight size={14} /></Link>
      </div>
    </section>
    <section className="section-panel map-panel"><div className="section-heading"><div><span className="eyebrow">FIELD COVERAGE · {coverage}%</span><h2>{selectedField?.name || 'Field'} monitoring map</h2></div><Link className="map-control" to="/history"><MapPin size={14} /> View scan locations <ArrowRight size={13} /></Link></div>
      <div className="coverage-summary"><span><strong>{selectedField?.monitoredZones || 0}</strong> monitored zones</span><span><strong>{scannedLocations}</strong> scanned locations</span><span>{selectedField?.totalArea > 0 ? `Scanned area / total area · ${selectedField.scannedArea} / ${selectedField.totalArea}` : `Coverage by registered zones · ${selectedField?.monitoredZones || 0} / ${selectedField?.registeredZones || 0}`}</span></div>
      {selectedField && <FieldMap field={selectedField} fields={fields} scans={scans} onFieldSelect={selectFieldOnMap} />}
      {detailsFieldId && <FieldDetailsPanel field={detailsField} summary={fieldDetails} loading={fieldDetailsLoading} error={fieldDetailsError} onClose={() => setDetailsFieldId(null)} />}
    </section>
  </div>;
}

function Metric({ icon: Icon, label, value, detail, trend, tone }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}><Icon size={17} /></span><div className="metric-label">{label}<CircleHelp size={13} title={detail} /></div><div className="metric-value">{value}</div><div className="metric-foot"><span>{detail}</span><span className={`metric-trend ${tone}`}>{tone === 'coral' ? <ArrowDown size={12} /> : <ArrowUpRight size={12} />}{trend}</span></div></article>;
}

function HealthChart() {
  return <div className="chart-area" role="img" aria-label="Illustrative crop health trend for this week"><div className="chart-y-labels"><span>100%</span><span>75%</span><span>50%</span></div><svg viewBox="0 0 420 122" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6abf83" stopOpacity=".23" /><stop offset="100%" stopColor="#6abf83" stopOpacity="0" /></linearGradient></defs><path d="M0 83 C28 76 39 66 63 73 S105 90 126 64 S164 62 188 56 S223 72 250 47 S283 56 313 32 S354 48 378 23 S403 29 420 13 L420 122 L0 122Z" fill="url(#chartFill)"/><path d="M0 83 C28 76 39 66 63 73 S105 90 126 64 S164 62 188 56 S223 72 250 47 S283 56 313 32 S354 48 378 23 S403 29 420 13" fill="none" stroke="#27804c" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/><circle cx="420" cy="13" r="4.5" fill="#fff" stroke="#27804c" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/></svg><div className="chart-x-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div>;
}

function FieldMap({ field, fields, scans, onFieldSelect }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const drawnItemsRef = useRef(null);
  const drawControlRef = useRef(null);
  const zoneLayersRef = useRef([]);
  const fieldMarkersRef = useRef([]);
  const currentLocationMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const routeControllerRef = useRef(null);
  const routeRefreshRef = useRef(null);
  const currentLocationRef = useRef(null);
  const watchIdRef = useRef(null);
  const onFieldSelectRef = useRef(onFieldSelect);
  const initialBoundsSetRef = useRef(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [mapReady, setMapReady] = useState(false);
  const [zoneMappings, setZoneMappings] = useState(field.zones || []);
  const [zoneDetails, setZoneDetails] = useState(() => getZoneDetails(field.id));
  const [zoneName, setZoneName] = useState('');
  const [plantCount, setPlantCount] = useState('');
  const [pendingZone, setPendingZone] = useState(null);
  const [drawingError, setDrawingError] = useState('');
  const [savingZone, setSavingZone] = useState(false);
  const [navigationActive, setNavigationActive] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const [routeSummary, setRouteSummary] = useState(null);
  const [mapSearch, setMapSearch] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState([]);
  const [mapSearchError, setMapSearchError] = useState('');
  const [searchingMap, setSearchingMap] = useState(false);
  currentLocationRef.current = currentLocation;
  useEffect(() => { onFieldSelectRef.current = onFieldSelect; }, [onFieldSelect]);
  const mappedZones = zoneMappings.filter((zone) => zone.path?.length >= 3).map((zone) => {
    const zoneScans = scans.filter((scan) => scan.fieldZoneId === String(zone.id));
    const healthyScans = zoneScans.filter((scan) => scan.health === 'Healthy').length;
    return {
      ...zone,
      plants: zoneDetails[String(zone.id)] ?? null,
      health: zoneScans.length ? Math.round((healthyScans / zoneScans.length) * 100) : null,
    };
  });

  useEffect(() => {
    setZoneMappings(field.zones || []);
    setZoneDetails(getZoneDetails(field.id));
    setZoneName('');
    setPlantCount('');
  }, [field.id, field.zones]);

  useEffect(() => {
    if (!mapContainerRef.current) return undefined;
    setMapReady(false);
    const map = L.map(mapContainerRef.current).setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;
    const drawControl = new L.Control.Draw({
      draw: {
        polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: '#25834a' } },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: false,
    });
    drawControlRef.current = drawControl;
    map.addControl(drawControl);
    map.on(L.Draw.Event.CREATED, (event) => {
      const path = event.layer.getLatLngs()[0].map(({ lat, lng }) => ({ lat, lng }));
      drawnItems.addLayer(event.layer);
      setPendingZone({ layer: event.layer, path });
      setDrawingError('');
      map.removeControl(drawControl);
    });
    mapRef.current = map;
    setMapReady(true);

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      map.off();
      map.remove();
      mapRef.current = null;
      drawnItemsRef.current = null;
      drawControlRef.current = null;
      zoneLayersRef.current = [];
      fieldMarkersRef.current = [];
      currentLocationMarkerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    fieldMarkersRef.current.forEach((marker) => marker.remove());
    const mappedFields = fields.filter(hasFieldCoordinates);
    fieldMarkersRef.current = mappedFields.map((item) => {
      const marker = L.marker([Number(item.latitude), Number(item.longitude)], {
        icon: L.divIcon({
          className: 'field-marker-icon',
          html: '<span class="field-marker-pulse"></span><span class="field-marker-dot"></span>',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
        title: item.name,
        keyboard: true,
      }).addTo(mapRef.current);
      marker.bindTooltip(item.name, { direction: 'top', offset: [0, -12] });
      marker.on('click', () => onFieldSelectRef.current(item.id));
      return marker;
    });
    if (mappedFields.length && !initialBoundsSetRef.current) {
      const bounds = L.featureGroup(fieldMarkersRef.current).getBounds();
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [36, 36], maxZoom: mappedFields.length === 1 ? 15 : 13 });
      initialBoundsSetRef.current = true;
    }
  }, [mapReady, fields]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !hasFieldCoordinates(field)) return;
    mapRef.current.flyTo([Number(field.latitude), Number(field.longitude)], Math.max(mapRef.current.getZoom(), 14), { duration: 0.5 });
  }, [mapReady, field.id, field.latitude, field.longitude]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return undefined;
    zoneLayersRef.current.forEach((layer) => layer.remove());
    zoneLayersRef.current = mappedZones.map((zone) => {
      const needsAttention = zone.health !== null && zone.health < 80;
      const color = needsAttention ? '#c94638' : '#27834a';
      const polygon = L.polygon(zone.path.map(({ lat, lng }) => [Number(lat), Number(lng)]), {
        color,
        fillColor: color,
        fillOpacity: 0.25,
        weight: 2,
      }).addTo(mapRef.current);
      const tooltip = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = zone.name;
      const details = document.createElement('span');
      details.textContent = `${zone.plants ?? 'Plant count not set'} plants · ${zone.health === null ? 'No scan data' : `${zone.health}% healthy`}`;
      tooltip.append(title, document.createElement('br'), details);
      polygon.bindTooltip(tooltip);
      return polygon;
    });
    return () => zoneLayersRef.current.forEach((layer) => layer.remove());
  }, [mapReady, zoneMappings, zoneDetails, scans, currentLocation]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (currentLocationMarkerRef.current) currentLocationMarkerRef.current.remove();
    if (!currentLocation) return;
    const position = [currentLocation.latitude, currentLocation.longitude];
    if (navigationActive) mapRef.current.panTo(position);
    currentLocationMarkerRef.current = L.circleMarker(position, {
      radius: 8,
      color: '#fff',
      weight: 3,
      fillColor: '#2878d0',
      fillOpacity: 1,
    }).addTo(mapRef.current).bindTooltip('Your current location');
  }, [mapReady, currentLocation, navigationActive]);

  useEffect(() => {
    if (!navigationActive || !navigator.geolocation?.watchPosition) return undefined;
    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setCurrentLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationStatus('ready');
      },
      (error) => setNavigationError(error.code === 1
        ? 'Location permission was denied while navigating.'
        : 'Live location updates stopped. Check GPS or device location services.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [navigationActive]);

  useEffect(() => {
    const routeOrigin = currentLocationRef.current;
    if (!navigationActive || !routeOrigin || !mapReady || !mapRef.current
      || !hasFieldCoordinates(field)) return undefined;
    const previousRoute = routeRefreshRef.current;
    const movedKm = previousRoute ? distanceBetweenKm(previousRoute, routeOrigin) : Infinity;
    if (previousRoute?.fieldId === field.id && movedKm < 0.1 && Date.now() - previousRoute.requestedAt < 30000) return undefined;
    routeControllerRef.current?.abort();
    const controller = new AbortController();
    routeControllerRef.current = controller;
    routeRefreshRef.current = { ...routeOrigin, fieldId: field.id, requestedAt: Date.now() };
    const start = `${routeOrigin.longitude},${routeOrigin.latitude}`;
    const finish = `${field.longitude},${field.latitude}`;
    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${start};${finish}?overview=full&geometries=geojson`;
    setNavigationError('');
    fetch(routeUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Routing service is unavailable. You can continue with Google Maps directions.');
        return response.json();
      })
      .then((data) => {
        const route = data.routes?.[0];
        if (!route?.geometry?.coordinates?.length) throw new Error('No driving route was found. Open Google Maps for directions.');
        const hadRoute = Boolean(routeLayerRef.current);
        routeLayerRef.current?.remove();
        const coordinates = route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]);
        routeLayerRef.current = L.polyline(coordinates, { color: '#2878d0', weight: 5, opacity: 0.85 }).addTo(mapRef.current);
        setRouteSummary({ distanceKm: route.distance / 1000, durationMinutes: route.duration / 60 });
        if (!hadRoute && routeLayerRef.current.getBounds().isValid()) mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [42, 42], maxZoom: 15 });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          routeLayerRef.current?.remove();
          routeLayerRef.current = null;
          setRouteSummary(null);
          setNavigationError(error.message || 'Could not calculate a route. Check your network connection.');
        }
      });
    return undefined;
  }, [navigationActive, currentLocation, mapReady, field.id, field.latitude, field.longitude]);

  useEffect(() => {
    if (navigationActive) return;
    routeControllerRef.current?.abort();
    routeControllerRef.current = null;
    routeRefreshRef.current = null;
  }, [navigationActive]);

  useEffect(() => () => routeControllerRef.current?.abort(), []);

  function restoreDrawControl() {
    if (mapRef.current && drawControlRef.current) mapRef.current.addControl(drawControlRef.current);
  }

  async function finishDrawing() {
    const name = zoneName.trim();
    const plants = Number(plantCount);
    if (!name || !Number.isInteger(plants) || plants < 1) {
      setDrawingError('Enter a zone name and a plant count of at least one.');
      return;
    }
    if (zoneMappings.some((zone) => zone.name.toLowerCase() === name.toLowerCase())) {
      setDrawingError('Choose a unique name for this field.');
      return;
    }
    if (!pendingZone) return;
    setSavingZone(true);
    setDrawingError('');
    try {
      const newZone = await createFieldZone(field.id, {
        name,
        color: '#27834a',
        path: pendingZone.path,
      });
      setZoneMappings((currentZones) => [...currentZones, newZone]);
      setZoneDetails((currentDetails) => {
        const updatedDetails = { ...currentDetails, [String(newZone.id)]: plants };
        saveZoneDetails(field.id, updatedDetails);
        return updatedDetails;
      });
      drawnItemsRef.current?.removeLayer(pendingZone.layer);
      setPendingZone(null);
      setZoneName('');
      setPlantCount('');
      restoreDrawControl();
    } catch (requestError) {
      setDrawingError(requestError.message);
    } finally {
      setSavingZone(false);
    }
  }

  function cancelDrawing() {
    if (pendingZone) drawnItemsRef.current?.removeLayer(pendingZone.layer);
    setPendingZone(null);
    setDrawingError('');
    restoreDrawControl();
  }

  async function removeZone(zoneId) {
    setDrawingError('');
    try {
      await deleteFieldZone(field.id, zoneId);
      setZoneMappings((currentZones) => currentZones.filter((zone) => zone.id !== zoneId));
      setZoneDetails((currentDetails) => {
        const updatedDetails = { ...currentDetails };
        delete updatedDetails[String(zoneId)];
        saveZoneDetails(field.id, updatedDetails);
        return updatedDetails;
      });
    } catch (requestError) {
      setDrawingError(requestError.message);
    }
  }

  function showCurrentLocation(startNavigation = false) {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported');
      if (startNavigation) setNavigationError('Location is not supported by this browser.');
      return;
    }
    setLocationStatus('loading');
    setNavigationError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationStatus('ready');
        if (startNavigation) setNavigationActive(true);
        else mapRef.current?.setView([position.coords.latitude, position.coords.longitude], 16);
      },
      (error) => {
        const denied = error.code === 1;
        setLocationStatus(denied ? 'denied' : 'error');
        if (startNavigation) setNavigationError(denied
          ? 'Location permission denied. Allow access to navigate to this field.'
          : 'GPS location unavailable. Check device location services and try again.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  function navigateToField() {
    if (!hasFieldCoordinates(field)) {
      setNavigationError('This field has no saved coordinates. Edit the field location before navigating.');
      return;
    }
    if (currentLocation) setNavigationActive(true);
    else showCurrentLocation(true);
  }

  function stopNavigation() {
    setNavigationActive(false);
    routeLayerRef.current?.remove();
    routeLayerRef.current = null;
    setRouteSummary(null);
  }

  async function searchMapLocation(event) {
    event.preventDefault();
    if (!mapSearch.trim()) return;
    setSearchingMap(true);
    setMapSearchError('');
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.search = new URLSearchParams({ q: mapSearch.trim(), format: 'jsonv2', limit: '5' }).toString();
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Map search is unavailable. Try again shortly.');
      const results = await response.json();
      setMapSearchResults(results);
      if (!results.length) setMapSearchError('No matching places found.');
    } catch (error) {
      setMapSearchError(error.message || 'Could not search places. Check your network connection.');
    } finally {
      setSearchingMap(false);
    }
  }

  function focusMapSearchResult(result) {
    mapRef.current?.setView([Number(result.lat), Number(result.lon)], 15);
    setMapSearch(result.display_name);
    setMapSearchResults([]);
    setMapSearchError('');
  }

  const googleMapsUrl = currentLocation
    ? `https://www.google.com/maps/dir/?api=1&origin=${currentLocation.latitude},${currentLocation.longitude}&destination=${field.latitude},${field.longitude}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${field.latitude},${field.longitude}&travelmode=driving`;
  const locationMessage = {
    denied: 'Location permission was denied. Allow access in your browser to show your position.',
    unsupported: 'Location is unavailable in this browser.',
    error: 'Could not determine your location. Check device location services and try again.',
  }[locationStatus];

  return <div className="field-map-layout">
    <section className="google-map-panel leaflet-map-panel" aria-label={`Field map for ${field.name}`}>
      <div className="google-map-heading"><span><MapPin size={14} /> Field map · {fields.length} registered</span><div className="google-map-actions"><button className="current-location-button" onClick={() => showCurrentLocation(false)} disabled={locationStatus === 'loading'}><LocateFixed size={13} />{locationStatus === 'loading' ? 'Locating…' : currentLocation ? 'Refresh location' : 'Show my location'}</button><button className="button button-primary navigate-field-button" onClick={navigateToField} disabled={locationStatus === 'loading' || !hasFieldCoordinates(field)}><Navigation size={13} />{navigationActive ? 'Recalculate route' : 'Navigate to Field'}</button>{hasFieldCoordinates(field) && <a className="current-location-button google-directions-link" href={googleMapsUrl} target="_blank" rel="noreferrer"><Navigation size={13} />Google Maps</a>}{navigationActive && <button className="current-location-button" onClick={stopNavigation}>Stop</button>}</div></div>
      <div className="field-map-stage">
        <div ref={mapContainerRef} className="leaflet-map-canvas" aria-label="Interactive field map. Red markers show registered fields." />
        <form className="field-map-search" role="search" onSubmit={searchMapLocation}><Search size={15} /><input aria-label="Search map locations" value={mapSearch} onChange={(event) => setMapSearch(event.target.value)} placeholder="Search map" /><button type="submit" aria-label="Search places" disabled={searchingMap}><Search size={14} /></button></form>
        {mapSearchResults.length > 0 && <div className="field-map-search-results">{mapSearchResults.map((result) => <button type="button" key={`${result.place_id}-${result.lat}`} onClick={() => focusMapSearchResult(result)}>{result.display_name}</button>)}</div>}
      </div>
      <div className="google-map-caption">{currentLocation ? `Centered on your location · ${currentLocation.latitude.toFixed(5)}, ${currentLocation.longitude.toFixed(5)}` : `Map center: ${field.location}. Allow location access to center on your current position.`}</div>
      {locationMessage && <p className="location-feedback" role="status">{locationMessage}</p>}
      {mapSearchError && <p className="field-map-feedback" role="alert">{mapSearchError}</p>}
      {navigationError && <p className="field-map-feedback" role="alert">{navigationError}</p>}
      {navigationActive && <div className="field-route-summary">{routeSummary && <><span><strong>{routeSummary.distanceKm.toFixed(1)} km</strong> estimated distance</span><span><strong>{Math.round(routeSummary.durationMinutes)} min</strong> driving time</span></>}<a href={googleMapsUrl} target="_blank" rel="noreferrer">Open turn-by-turn in Google Maps <ArrowUpRight size={13} /></a></div>}
      {!hasFieldCoordinates(field) && <p className="field-map-feedback">This field has no saved coordinates and cannot be mapped or navigated to.</p>}
      <div className="zone-drawing-controls">
        <label htmlFor="new-zone-name">Zone name<input id="new-zone-name" value={zoneName} onChange={(event) => setZoneName(event.target.value)} placeholder="e.g. East irrigation block" /></label>
        <label htmlFor="new-zone-plants">Plants in zone<input id="new-zone-plants" type="number" min="1" step="1" value={plantCount} onChange={(event) => setPlantCount(event.target.value)} placeholder="e.g. 120" /></label>
        {pendingZone && <div className="zone-drawing-actions"><button className="button button-primary" onClick={finishDrawing} disabled={savingZone}>{savingZone ? 'Saving zone…' : <><Check size={14} /> Save zone</>}</button><button className="button button-secondary" onClick={cancelDrawing} disabled={savingZone}><X size={14} /> Cancel shape</button></div>}
        <p className="zone-drawing-hint" role="status">{pendingZone ? `${pendingZone.path.length} boundary points captured. Add a name and plant count, then save.` : 'Use the polygon tool on the map to draw a plant zone.'}</p>
        {drawingError && <p className="zone-drawing-error" role="alert">{drawingError}</p>}
        {mappedZones.length > 0 && <div className="drawn-zone-list" aria-label="Saved field zones">{mappedZones.map((zone) => {
          const needsAttention = zone.health !== null && zone.health < 80;
          return <div key={zone.id} className={`drawn-zone-item ${needsAttention ? 'zone-needs-attention' : ''}`}><span><i />{zone.name}<small>{zone.plants ?? 'Plant count not set'} plants · {zone.health === null ? 'No scan data' : `${zone.health}% healthy`}</small></span><button onClick={() => removeZone(zone.id)} aria-label={`Delete ${zone.name}`} title={`Delete ${zone.name}`}><X size={14} /></button></div>;
        })}</div>}
      </div>
      <div className="map-legend field-map-legend"><span><i className="legend-field" /> Registered field</span><span><i className="legend-location" /> Your location</span><span><i className="legend-route" /> Navigation route</span><span><i className="legend-healthy" /> Healthy zone</span><span><i className="legend-risk" /> Needs attention</span></div>
    </section>
    <div className="scan-location-list">
      <div className="scan-location-heading"><strong>Scan locations</strong><span>{scans.length} records</span></div>
      {scans.length ? scans.map((scan) => {
        return <div key={scan.id} className="scan-location-card">
          <span className={`location-marker ${scan.health === 'Healthy' ? 'healthy' : 'risk'}`}><MapPin size={15} /></span>
          <Link className="scan-location-content" to={`/reports/${scan.id}`}><strong>{scan.location}</strong><span>{new Date(scan.createdAt).toLocaleDateString()} · {scan.prediction}</span></Link>
          <span className={`status-pill ${scan.health === 'Healthy' ? 'status-healthy' : 'status-risk'}`}><i />{scan.health}</span>
        </div>;
      }) : <p className="scan-location-empty">No scan locations recorded for this field yet.</p>}
    </div>
  </div>;
}

function hasFieldCoordinates(field) {
  return field?.latitude !== null && field?.latitude !== undefined
    && field?.longitude !== null && field?.longitude !== undefined
    && Number.isFinite(Number(field.latitude)) && Number.isFinite(Number(field.longitude));
}

function distanceBetweenKm(first, second) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const startLatitude = toRadians(first.latitude);
  const endLatitude = toRadians(second.latitude);
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function FieldDetailsPanel({ field, summary, loading, error, onClose }) {
  if (!field) return null;
  const totalPlants = Number(summary?.field?.plant_count ?? field.plants ?? 0);
  const healthyPlants = summary?.healthy_plant_count;
  const unhealthyPlants = summary?.unhealthy_plant_count;
  const healthPercent = totalPlants > 0 && healthyPlants !== null && healthyPlants !== undefined
    ? Math.round((Number(healthyPlants) / totalPlants) * 1000) / 10
    : null;
  const recommendations = [...new Set((summary?.recent_scans || [])
    .flatMap((scan) => Array.isArray(scan.recommendations) ? scan.recommendations : []))].slice(0, 5);
  const lastMonitoring = summary?.last_monitoring_at
    ? new Date(summary.last_monitoring_at).toLocaleString()
    : 'No linked scans';

  return <aside className="field-details-panel" aria-label={`${field.name} field details`}>
    <div className="field-details-heading"><div><span className="eyebrow">FIELD DETAILS</span><h3>{field.name}</h3><p>{field.location}</p></div><button className="icon-button" onClick={onClose} aria-label="Close field details"><X size={17} /></button></div>
    {loading ? <div className="field-details-loading" role="status"><span className="button-spinner" /> Loading field health and scan history…</div> : error ? <p className="field-map-feedback" role="alert">{error}</p> : summary && <>
      <div className="field-detail-metrics">
        <article><span>Total plants</span><strong>{totalPlants.toLocaleString()}</strong></article>
        <article><span>Healthy plants</span><strong>{healthyPlants ?? '—'}</strong></article>
        <article><span>Unhealthy plants</span><strong>{unhealthyPlants ?? '—'}</strong></article>
        <article><span>Health rate</span><strong>{healthPercent === null ? '—' : `${healthPercent}%`}</strong></article>
      </div>
      <div className="field-health-progress"><div><span>Estimated plant health</span><strong>{healthPercent === null ? 'No linked scan data' : `${healthPercent}%`}</strong></div><progress max="100" value={healthPercent ?? 0} aria-label="Estimated healthy plant percentage" /></div>
      <p className="field-estimate-note">{summary.plant_count_note}</p>
      <div className="field-detail-facts"><span><strong>{summary.completed_ai_scans}</strong> completed AI scans</span><span><strong>{lastMonitoring}</strong> last monitoring</span></div>
      <div className="field-detail-section"><h4>Recently detected diseases</h4>{summary.recent_diseases.length ? <ul>{summary.recent_diseases.map((disease) => <li key={disease.name}>{disease.name}<small>{disease.scan_count} scans</small></li>)}</ul> : <p>No disease detections in linked scans.</p>}</div>
      <div className="field-detail-section"><h4>Recommendations and precautions</h4>{recommendations.length ? <ul>{recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}</ul> : <p>No treatment recommendations recorded.</p>}</div>
      <div className="field-detail-section"><h4>Recent AI scans</h4>{summary.recent_scans.length ? <ul className="field-detail-scans">{summary.recent_scans.slice(0, 5).map((scan) => <li key={scan.id}><span><strong>{scan.prediction}</strong><small>{new Date(scan.created_at).toLocaleString()}</small></span><small>{scan.health_status}</small></li>)}</ul> : <p>No scans linked to this field.</p>}</div>
    </>}
  </aside>;
}

function ScanRow({ scan, compact = false, onOpen }) {
  const content = <><img className="scan-thumb" src={scan.image} alt="Tomato crop scan" /><span className="scan-row-main"><strong>{scan.prediction === 'Healthy' ? 'Healthy leaf' : scan.prediction}</strong><span>{scan.location} <i /> {relativeDate(scan.createdAt)}</span></span><span className={`status-pill ${scan.health === 'Healthy' ? 'status-healthy' : 'status-risk'}`}><i />{scan.health}</span><span className="scan-confidence">{Number(scan.confidence).toFixed(1)}%</span><span className="row-open"><ArrowRight size={16} /></span></>;
  return onOpen ? <button className={`scan-row ${compact ? 'compact' : ''} scan-row-button`} onClick={() => onOpen(scan)}>{content}</button> : <Link className={`scan-row ${compact ? 'compact' : ''}`} to={`/reports/${scan.id}`}>{content}</Link>;
}

function ScanPage({ fields, activeFieldId, onResult }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState(activeFieldId || fields[0]?.id || '');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const videoRef = useRef(null);
  const uploadRef = useRef(null);
  const selectedField = fields.find((field) => field.id === selectedFieldId);
  const selectedZone = selectedField?.zones.find((zone) => zone.id === selectedZoneId);
  const locationName = selectedField
    ? `${selectedField.name}${selectedZone ? ` · ${selectedZone.name}` : ''}`
    : 'Unspecified location';

  useEffect(() => {
    if (!fields.some((field) => field.id === selectedFieldId)) {
      setSelectedFieldId(activeFieldId || fields[0]?.id || '');
      setSelectedZoneId('');
    }
  }, [fields, activeFieldId, selectedFieldId]);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let stream;
    async function openCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setCameraError('Camera permission was denied or no camera is available. Upload a photo instead.');
      }
    }
    openCamera();
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [cameraOpen]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function acceptFile(nextFile) {
    setError('');
    if (!nextFile) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(nextFile.type)) return setError('Choose a JPG, PNG, or WEBP image.');
    if (nextFile.size > 10 * 1024 * 1024) return setError('This image is over 10 MB. Choose a smaller file.');
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
  }

  function capturePhoto() {
    if (!videoRef.current?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      acceptFile(new File([blob], `field-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      setCameraOpen(false);
    }, 'image/jpeg', 0.9);
  }

  async function submitScan() {
    if (!file) return setError('Add a tomato leaf image before starting a scan.');
    setAnalyzing(true);
    setError('');
    try {
      const result = await analyzeImage(file, locationName, {
        fieldId: selectedField?.id,
        fieldZoneId: selectedZone?.id,
      });
      onResult({ ...result, image: preview });
    } catch (requestError) {
      setError(requestError.message);
      setAnalyzing(false);
    }
  }

  return <div className="page scan-page">
    <Heading eyebrow="CROP SCAN · TOMATO" title="Start a crop scan" description="Capture a clear leaf photo to create a crop health report." />
    <div className="demo-notice"><span><CircleHelp size={17} /></span><div><strong>Model-assisted screening</strong><p>Your photo is sent to the AgroDoc API for tomato leaf screening. Confirm results with an agricultural professional.</p></div><span className="demo-mode-tag">LIVE API</span></div>
    <div className="scan-workspace">
      <section className="scan-input-panel"><div className="step-heading"><span>01</span><div><h2>Add a field photo</h2><p>Use a recent, well-lit image of a tomato leaf.</p></div></div>
        {cameraOpen ? <div className="camera-stage">{cameraError ? <div className="camera-error"><Camera size={24} /><p>{cameraError}</p><button className="button button-secondary" onClick={() => { setCameraOpen(false); uploadRef.current?.click(); }}>Choose an image</button></div> : <><video ref={videoRef} autoPlay playsInline muted /><span className="camera-frame" /><button className="camera-close" onClick={() => setCameraOpen(false)} aria-label="Close camera"><X size={17} /></button><button className="capture-button" onClick={capturePhoto} aria-label="Capture photo"><span /></button></>}</div> : preview ? <div className="photo-preview"><img src={preview} alt="Selected tomato leaf preview" /><div className="preview-overlay"><span><CheckCircle2 size={16} /> Photo ready</span><button onClick={() => { setFile(null); setPreview(''); setError(''); }}>Remove <X size={14} /></button></div></div> : <div className="upload-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); acceptFile(event.dataTransfer.files[0]); }}><div className="upload-symbol"><CloudUpload size={23} /></div><strong>Drop your image here</strong><span>or browse from your device</span><button className="button button-secondary browse-button" onClick={() => uploadRef.current?.click()}><Upload size={15} /> Browse files</button><small>JPG, PNG, WEBP · Max 10 MB</small></div>}
        <input ref={uploadRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => acceptFile(event.target.files?.[0])} aria-label="Choose a tomato leaf image" />
        {!cameraOpen && <div className="scan-alternatives"><span>OR</span><button className="button button-secondary" onClick={() => { setCameraError(''); setCameraOpen(true); }}><Camera size={16} /> Take a photo</button></div>}
        {error && <div className="inline-error" role="alert"><AlertCircle size={15} />{error}</div>}
        <div className="photo-tips"><span><Check size={14} /> Focus on one leaf</span><span><Check size={14} /> Use natural light</span><span><Check size={14} /> Avoid heavy shadows</span></div>
      </section>
      <aside className="scan-details-panel"><div className="step-heading"><span>02</span><div><h2>Scan details</h2><p>Add a location to organize your field notes.</p></div></div>
        <label className="field-label" htmlFor="scan-field">Field</label><div className="select-wrap"><MapPin size={16} /><select id="scan-field" value={selectedFieldId} onChange={(event) => { const nextField = fields.find((field) => field.id === event.target.value); setSelectedFieldId(event.target.value); setSelectedZoneId(nextField?.zones[0]?.id || ''); }}><option value="">Unassigned field</option>{fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select><ChevronDown size={15} /></div>
        {selectedField && <><label className="field-label scan-zone-label" htmlFor="scan-zone">Zone (optional)</label><div className="select-wrap"><MapPin size={16} /><select id="scan-zone" value={selectedZoneId} onChange={(event) => setSelectedZoneId(event.target.value)}><option value="">No zone selected</option>{selectedField.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select><ChevronDown size={15} /></div></>}
        <div className="scan-location-preview" aria-live="polite">Scan location · <strong>{locationName}</strong></div>
        <div className="scan-details-rule" /><div className="detail-row"><span>Crop</span><strong><i /> Tomato</strong></div><div className="detail-row"><span>Scan type</span><strong>Leaf health check</strong></div><div className="detail-row"><span>Image privacy</span><strong><ShieldCheck size={15} /> Uploaded for analysis</strong></div>
        <button className="button button-primary analyze-button" disabled={analyzing} onClick={submitScan}>{analyzing ? <><span className="button-spinner" /> Analyzing image…</> : <>Continue to analysis <ArrowRight size={16} /></>}</button><div className="secure-note"><ShieldCheck size={14} /><span>The image is uploaded to the configured AgroDoc API and attached to your saved scan.</span></div>
      </aside>
    </div>
    <div className="scan-help"><span><CircleHelp size={17} /></span><div><strong>Need help getting a clear photo?</strong><p>Photograph a single leaf against a simple background, keeping the camera steady and the full leaf in frame.</p></div></div>
  </div>;
}

function ScanResult({ scan }) {
  const navigate = useNavigate();
  if (!scan) return <EmptyState icon={Focus} title="No scan to show" body="Start a crop scan to preview its report." action={<Link to="/scan" className="button button-primary">Start a scan</Link>} />;
  const diagnostic = getDiagnosticOutput(scan);
  return <div className="page result-page"><Link className="back-link" to="/scan"><ArrowLeft size={15} /> Back to crop scan</Link>
    <div className="page-heading diagnostic-page-heading"><h1>Live Diagnostic Output</h1></div>
    <section className="diagnostic-card" aria-label="Live diagnostic output">
      <header className="diagnostic-header">
        <div className="diagnostic-header-top"><span className="diagnostic-kicker">{scan.isDemo ? 'SAMPLE' : 'AUTOMATED'} DIAGNOSTIC OUTPUT #{diagnostic.reference}</span><span className={`diagnostic-confidence confidence-${diagnostic.confidenceLevel}`}>{diagnostic.confidenceLabel} · {diagnostic.confidenceText}</span></div>
        <h2>{diagnostic.isHealthy ? 'Healthy foliage' : `${diagnostic.disease} (Pathology Infection)`}</h2>
        <p className="diagnostic-specimen">Specimen: {diagnostic.specimen} · Field Zone: {diagnostic.fieldZone} · Location: {diagnostic.location}</p>
        <p className="diagnostic-warning">{diagnostic.warning}</p>
      </header>
      <div className="diagnostic-facts">
        <div><strong>Disease:</strong> {diagnostic.disease}</div><div><strong>Pest Vector:</strong> {diagnostic.pestVector}</div>
        <div><strong>Nutritional Status:</strong> {diagnostic.nutritionalStatus}</div><div><strong>Fruit Quality:</strong> {diagnostic.fruitQuality}</div>
      </div>
      <div className="diagnostic-treatments">
        <section className="treatment-panel organic-treatment"><h3><Sprout size={15} /> Organic Solutions</h3><ul>{diagnostic.organicSolutions.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section className="treatment-panel chemical-treatment"><h3><ShieldCheck size={15} /> Chemical Treatments</h3><ul>{diagnostic.chemicalTreatments.map((item) => <li key={item}>{item}</li>)}</ul></section>
      </div>
    </section>
    <div className="diagnostic-actions"><span><CalendarDays size={14} /> {formatDate(scan.createdAt)}</span><div><button className="button button-secondary" onClick={() => navigate(`/reports/${scan.id}`)}><FileText size={16} /> Full report</button><button className="button button-primary" disabled><Check size={16} /> Saved to history</button></div></div>
  </div>;
}

function HistoryPage({ scans, initialSearch, onOpen }) {
  const [query, setQuery] = useState(initialSearch);
  const [status, setStatus] = useState('All statuses');
  const [sort, setSort] = useState('Newest first');
  const filtered = scans.filter((scan) => `${scan.prediction} ${scan.location}`.toLowerCase().includes(query.toLowerCase()) && (status === 'All statuses' || scan.health === status)).sort((a, b) => sort === 'Newest first' ? new Date(b.createdAt) - new Date(a.createdAt) : new Date(a.createdAt) - new Date(b.createdAt));
  return <div className="page history-page"><Heading eyebrow="YOUR FIELD RECORD" title="Scan history" description="Every field check, in one place." action={<Link to="/scan" className="button button-primary"><Plus size={16} /> New crop scan</Link>} />
    <div className="history-toolbar"><label className="history-search"><Search size={16} /><input aria-label="Search by disease or field zone" placeholder="Search by disease or field zone" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}</label><label className="filter-select"><Filter size={15} /><select aria-label="Filter scans by status" value={status} onChange={(event) => setStatus(event.target.value)}><option>All statuses</option><option>Healthy</option><option>At risk</option></select><ChevronDown size={14} /></label><label className="filter-select"><ArrowDown size={15} /><select aria-label="Sort scans" value={sort} onChange={(event) => setSort(event.target.value)}><option>Newest first</option><option>Oldest first</option></select><ChevronDown size={14} /></label></div>
    <div className="history-table-wrap"><div className="history-table-heading"><span>{filtered.length} {filtered.length === 1 ? 'scan' : 'scans'}</span><span>LAST 30 DAYS</span></div>{filtered.length ? <div>{filtered.map((scan) => <ScanRow key={scan.id} scan={scan} onOpen={onOpen} />)}</div> : <EmptyState icon={Search} title={scans.length ? 'No matching scans' : 'Your history starts here'} body={scans.length ? 'Try changing the search or status filter.' : 'Run your first scan to add a field record.'} action={scans.length ? <button className="button button-secondary" onClick={() => { setQuery(''); setStatus('All statuses'); }}>Clear filters</button> : <Link className="button button-primary" to="/scan">Start a crop scan</Link>} />}</div>
    <div className="history-footnote"><ShieldCheck size={15} /><span>Your scan history is loaded from your AgroDoc account.</span></div>
  </div>;
}

function ReportsPage({ scans }) {
  return <div className="page reports-page"><Heading eyebrow="FIELD DOCUMENTS" title="Crop health reports" description="Review detailed scan findings and export a field note." action={<Link className="button button-primary" to="/scan"><Plus size={16} /> New crop scan</Link>} />
    <div className="reports-intro"><span><FileText size={20} /></span><div><strong>{scans.length} reports available</strong><p>Reports are created from saved scan records in your AgroDoc account.</p></div><span className="demo-mode-tag">SYNCED</span></div>
    <section className="reports-list">{scans.length ? scans.map((scan) => <Link key={scan.id} className="report-card" to={`/reports/${scan.id}`}><img src={scan.image} alt="Tomato leaf report thumbnail" /><span className="report-card-main"><span className="eyebrow">{formatDate(scan.createdAt)} · {scan.location}</span><strong>{scan.prediction === 'Healthy' ? 'Healthy crop report' : `${scan.prediction} report`}</strong><span>{scan.health} <i /> Confidence {Number(scan.confidence).toFixed(1)}%</span></span><span className={`status-pill ${scan.health === 'Healthy' ? 'status-healthy' : 'status-risk'}`}><i />{scan.health}</span><span className="report-arrow"><ArrowRight size={17} /></span></Link>) : <EmptyState icon={FileText} title="No reports yet" body="Save a scan to create your first crop health report." action={<Link to="/scan" className="button button-primary">Start a scan</Link>} />}</section>
    <div className="report-export-note"><Download size={16} /><span>Reports can be printed or saved as PDF from the report detail page.</span></div>
  </div>;
}

function ReportPage({ scans, activeScan }) {
  const { id } = useParams();
  const cachedScan = activeScan?.id === id ? activeScan : scans.find((item) => item.id === id);
  const [loadedScan, setLoadedScan] = useState(null);
  useEffect(() => {
    let active = true;
    setLoadedScan(null);
    if (cachedScan?.analysis) {
      setLoadedScan(cachedScan);
      return () => { active = false; };
    }
    getScanDetails(id).then((details) => {
      if (active) setLoadedScan(details);
    }).catch(() => {});
    return () => { active = false; };
  }, [id, cachedScan]);
  const scan = loadedScan || cachedScan;
  if (!scan) return <EmptyState icon={FileText} title="Report not found" body="This report may have been removed from local storage." action={<Link to="/reports" className="button button-secondary">Back to reports</Link>} />;
  function exportNotes() {
    const url = URL.createObjectURL(new Blob([buildReportText(scan)], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `agrodoc-${scan.id}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return <div className="page report-detail-page"><Link className="back-link" to="/reports"><ArrowLeft size={15} /> All reports</Link>
    <Heading eyebrow="TOMATO CROP HEALTH REPORT" title={scan.prediction === 'Healthy' ? 'Healthy crop report' : `${scan.prediction} report`} description={`Generated from your scan on ${formatDateTime(scan.createdAt)}.`} action={<div className="heading-actions"><button className="button button-secondary" onClick={exportNotes}><Download size={16} /> Export notes</button><button className="button button-primary" onClick={() => window.print()}><FileText size={16} /> Print / Save PDF</button></div>} />
    {scan.isDemo && <div className="demo-notice compact-notice"><span><CircleHelp size={16} /></span><div><strong>Illustrative sample report</strong><p>Not a diagnosis. Confirm crop concerns with a qualified agricultural professional.</p></div></div>}
    <article className="report-document"><div className="report-doc-top"><Brand /><span className="report-reference">REPORT · {scan.id.toUpperCase()}</span></div>
      <div className="report-result-banner"><img src={scan.image} alt="Tomato leaf image from this scan" /><div><span className="eyebrow">CROP HEALTH RESULT · TOMATO</span><h2>{scan.prediction === 'Healthy' ? 'No supported disease detected' : `Possible ${scan.prediction}`}</h2><span className={`status-pill ${scan.health === 'Healthy' ? 'status-healthy' : 'status-risk'}`}><i />{scan.health}</span></div><div className="report-confidence"><strong>{Number(scan.confidence).toFixed(1)}<small>%</small></strong><span>Sample confidence</span></div></div>
      <div className="report-info-grid"><div><span>SCAN DATE &amp; TIME</span><strong>{formatDateTime(scan.createdAt)}</strong></div><div><span>FIELD LOCATION</span><strong>{scan.location}</strong></div><div><span>CROP</span><strong>Tomato</strong></div><div><span>SCAN TYPE</span><strong>Leaf health check</strong></div></div>
      <ReportSection number="01" label="OBSERVATION" title="Disease detection"><p>{scan.health === 'Healthy' ? 'No supported disease detected in this sample.' : `${scan.prediction} pattern shown in this sample result.`} Confirm any suspected condition through field inspection or an agricultural professional.</p></ReportSection>
      <ReportSection number="02" label="FIELD NOTES" title="Analysis"><p>{scan.analysis}</p></ReportSection>
      <ReportSection number="03" label="RECOMMENDED ACTIONS" title="What to do next"><ul className="recommendation-list">{scan.recommendations.map((item) => <li key={item}><CheckCircle2 size={16} /><span>{item}</span></li>)}</ul></ReportSection>
      <div className="report-disclaimer"><CircleHelp size={15} /><span>Automated screening is not a definitive diagnosis. Confirm crop concerns with a qualified agricultural professional before treatment.</span></div>
    </article>
  </div>;
}

function ReportSection({ number, label, title, children }) {
  return <section className="report-doc-section"><span>{number}</span><div><span className="eyebrow">{label}</span><h3>{title}</h3>{children}</div></section>;
}

function Brand() {
  return <span className="brand report-brand"><span className="brand-mark"><Sprout size={20} /></span><span className="brand-name">Agro<span>doc</span><small>FIELD INTELLIGENCE</small></span></span>;
}

function LoginPage({ onAuthenticate, onThemeChange, page, theme }) {
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('maya@northfield.farm');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const authDialogRef = useRef(null);
  const authTriggerRef = useRef(null);
  const creatingAccount = mode === 'signup';

  useEffect(() => {
    if (!authDialogOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    authDialogRef.current?.focus();
    function closeOnEscape(event) {
      if (event.key === 'Escape') setAuthDialogOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      authTriggerRef.current?.focus();
    };
  }, [authDialogOpen]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!email.includes('@') || !password) return setError('Enter a valid email and your password.');
    if (creatingAccount && !name.trim()) return setError('Enter your name to create an account.');
    if (creatingAccount && password.length < 8) return setError('Use a password with at least 8 characters.');
    if (creatingAccount && password !== confirmPassword) return setError('Your passwords do not match.');
    setSubmitting(true);
    try {
      await onAuthenticate({ mode: creatingAccount ? 'signup' : 'signin', name, email, password, confirmPassword });
      setAuthDialogOpen(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setError('');
  }

  function openAccess(nextMode, event) {
    authTriggerRef.current = event.currentTarget;
    changeMode(nextMode);
    setAuthDialogOpen(true);
  }

  function closeAccess() {
    setAuthDialogOpen(false);
  }

  return <main className={`auth-screen theme-${theme}`}>
    <header className="landing-header" id="top">
      <Link className="brand login-brand" to="/" aria-label="AgroDoc home"><span className="brand-mark"><Sprout size={21} /></span><span className="brand-name">Agro<span>doc</span><small>FIELD INTELLIGENCE</small></span></Link>
      <nav className="landing-nav" aria-label="Landing page">
        <Link className={page === 'about' ? 'active' : ''} to="/about">About</Link><Link className={page === 'testimonial' ? 'active' : ''} to="/testimonial">Testimonial</Link><Link className={page === 'contact' ? 'active' : ''} to="/contact">Contact</Link>
        <InstallAppButton variant="landing-install" />
        <button className="landing-theme-toggle" type="button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} aria-pressed={theme === 'dark'} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}<span>{theme === 'light' ? 'Dark' : 'Light'}</span></button>
        <button className="landing-signup" type="button" onClick={(event) => openAccess('signup', event)}>Sign up <ArrowRight size={15} /></button>
      </nav>
    </header>
    {page === 'home' ? <>
    <section className="landing-hero">
      <div className="landing-hero-copy"><span className="landing-kicker"><i /> CROP HEALTH, CLOSER TO THE FIELD</span><h1>See the small changes.<br /><em>Grow with clarity.</em></h1><p>AgroDoc helps tomato growers keep field observations, crop scans, and health reports together, so the next step is easier to see.</p><div className="landing-hero-actions"><button className="button button-primary" onClick={(event) => openAccess('signup', event)}>Create your workspace <ArrowRight size={16} /></button><Link to="/explore" className="landing-text-link">Explore AgroDOC <ArrowRight size={15} /></Link></div><div className="landing-proof"><span><CheckCircle2 size={15} /> Field notes in one place</span><span><ShieldCheck size={15} /> Data stays in this demo</span></div></div>
      <div className="landing-hero-visual" role="img" aria-label="Tomato plants and ripe tomatoes growing in a field"><div className="hero-observation"><span className="hero-observation-icon"><Leaf size={17} /></span><span><small>FIELD SNAPSHOT</small><strong>Make scouting count</strong></span><ArrowUpRight size={16} /></div><div className="hero-image-caption"><span>NORTH FIELD · TOMATOES</span><strong>Every observation<br />adds to the picture.</strong></div></div>
      <div className="landing-hero-index"><span>01</span><i /><span>FIELD INTELLIGENCE</span></div>
    </section>
    <section className="landing-about" id="about">
      <div className="template-about-row">
        <div className="template-about-copy"><span className="template-kicker">ABOUT US</span><h2>TOMATO FIELD INTELLIGENCE</h2><p>Keep tomato observations, crop scans, and field reports connected. AgroDoc helps growers record what they see and follow changes from one scouting round to the next.</p><Link to="/about" className="template-dark-button">LEARN MORE</Link></div>
        <div className="template-about-images"><img className="template-about-main-image" src="https://images.unsplash.com/photo-1592841200221-a6898f307baa?auto=format&fit=crop&w=900&q=85" alt="Ripe tomatoes growing on the vine" /><img className="template-about-small-image" src="https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=500&q=85" alt="Fresh harvested tomatoes" /></div>
      </div>
      <div className="template-services" id="how-it-works">
        <span className="template-kicker">WHAT WE DO</span><h2>SERVICES WE OFFER</h2>
        <div className="template-service-grid">
          <article className="template-service-card"><img src="https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=720&q=85" alt="Fresh red tomatoes" /><div className="template-service-copy"><h3>FRESH TOMATOES</h3><p>Capture tomato crop observations and connect each scan to its field location.</p></div><Link to="/scan" className="template-dark-button">READ MORE</Link></article>
          <article className="template-service-card"><img src="https://images.unsplash.com/photo-1592841200221-a6898f307baa?auto=format&fit=crop&w=720&q=85" alt="Tomato plants growing in a field" /><div className="template-service-copy"><h3>TOMATO FIELD CARE</h3><p>Organize monitored zones, review plant health, and spot areas that need attention.</p></div><Link to="/" className="template-dark-button">READ MORE</Link></article>
          <article className="template-service-card"><img src="https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=720&q=85" alt="Harvested tomatoes ready for inspection" /><div className="template-service-copy"><h3>ORGANIC GROWING</h3><p>Keep scouting notes and crop reports together to support thoughtful follow-up.</p></div><Link to="/reports" className="template-dark-button">READ MORE</Link></article>
        </div>
      </div>
      <p className="landing-disclaimer"><CircleHelp size={14} /> Demo scan results are illustrative and are not a crop diagnosis.</p>
    </section>
    <section className="landing-testimonials" id="testimonials"><div className="testimonial-heading"><span className="landing-kicker">FIELD NOTES</span><h2>Made for the work that happens outdoors.</h2><p>Thoughtful tools for a more consistent scouting habit.</p></div><figure className="testimonial-quote"><span className="quote-mark">“</span><blockquote>When observations are easy to record, it’s easier to spot what deserves a closer look.</blockquote><figcaption><span className="testimonial-avatar">NF</span><span><strong>North Field grower</strong><small>Illustrative demo testimonial</small></span></figcaption></figure><span className="testimonial-side-note">NOTICE · RECORD · FOLLOW UP</span></section>
    <section className="landing-contact" id="contact"><h2>Start with your field.</h2><p>Set up a demo workspace to explore crop scans, field history, and reports.</p></section>
    <section className="landing-benefits" aria-labelledby="landing-benefits-title"><div className="landing-benefits-heading"><span className="landing-kicker">FIELD WORK, CONNECTED</span><h2 id="landing-benefits-title">Included in your workspace</h2></div><div className="landing-benefits-grid">
      <article><CheckCircle2 size={22} /><h3>Crop photo capture</h3><p>Add a leaf photo to start a field scan and keep its location with the record.</p></article>
      <article><CheckCircle2 size={22} /><h3>Field-specific history</h3><p>Keep observations organized by crop condition and field zone.</p></article>
      <article><CheckCircle2 size={22} /><h3>Search and filters</h3><p>Find past scans by disease, location, or health status.</p></article>
      <article><CheckCircle2 size={22} /><h3>Detailed reports</h3><p>Review scan notes, sample results, and suggested next steps together.</p></article>
      <article><CheckCircle2 size={22} /><h3>Exportable notes</h3><p>Download report notes or print a report for your field records.</p></article>
      <article><CheckCircle2 size={22} /><h3>Local demo storage</h3><p>Your saved demo scans stay in this browser workspace.</p></article>
    </div></section>
    </> : page === 'about' ? <AboutPage /> : page === 'testimonial' ? <TestimonialPage /> : page === 'contact' ? <ContactPage /> : <ExplorePage />}
    {authDialogOpen && <div className="auth-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAccess(); }}><section ref={authDialogRef} className="login-panel landing-login-panel auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title" tabIndex={-1}>
      <button className="auth-dialog-close" type="button" onClick={closeAccess} aria-label="Close account dialog"><X size={19} /></button>
      <div className="auth-dialog-heading"><span className="landing-kicker">AGRODOC FIELD WORKSPACE</span><h2 id="auth-dialog-title">{creatingAccount ? 'Create your account' : 'Log in to AgroDoc'}</h2><p>Access your crop scans, field history, and reports.</p></div>
      <div className="auth-tabs" role="tablist" aria-label="Account access"><button type="button" role="tab" aria-selected={!creatingAccount} className={!creatingAccount ? 'selected' : ''} onClick={() => changeMode('signin')}>Log in</button><button type="button" role="tab" aria-selected={creatingAccount} className={creatingAccount ? 'selected' : ''} onClick={() => changeMode('signup')}>Sign up</button></div><form className="login-form" onSubmit={submit}>
        {creatingAccount && <><label htmlFor="signup-name">Full name</label><input id="signup-name" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></>}
        <label htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete={creatingAccount ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={creatingAccount ? 8 : 1} required />
        {creatingAccount && <><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></>}
        {error && <div className="inline-error" role="alert"><AlertCircle size={15} />{error}</div>}
        <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Connecting…' : creatingAccount ? 'Create account' : 'Log in'} <ArrowRight size={16} /></button><p className="login-demo-hint">Your credentials are sent to the AgroDoc API for authentication.</p>
      </form><p className="login-switch">{creatingAccount ? 'Already have a demo account?' : 'New to AgroDoc?'} <button type="button" onClick={() => changeMode(creatingAccount ? 'signin' : 'signup')}>{creatingAccount ? 'Log in' : 'Sign up'}</button></p></section></div>}
    <footer className="landing-footer"><div className="landing-footer-main"><div className="landing-footer-about"><Link className="brand landing-footer-brand" to="/" aria-label="AgroDoc home"><span className="brand-mark"><Sprout size={21} /></span><span className="brand-name">Agro<span>doc</span><small>FIELD INTELLIGENCE</small></span></Link><p>AgroDoc brings tomato crop observations, scans, and field reports together for growers.</p></div><div className="landing-footer-column"><strong>Solutions</strong><Link to="/about#how-it-works">Crop scans</Link><Link to="/about#how-it-works">Field history</Link><Link to="/about#how-it-works">Crop reports</Link></div><div className="landing-footer-column"><strong>Resources</strong><Link to="/about">How AgroDoc works</Link><Link to="/testimonial">Field notes</Link><Link to="/contact">Demo workspace</Link></div><div className="landing-footer-column"><strong>Company</strong><Link to="/about">About AgroDoc</Link><Link to="/contact">Contact</Link><Link to="/testimonial">Testimonials</Link></div></div><div className="landing-footer-bottom"><span>© 2026 AgroDoc · Demo workspace data stays in this browser</span><Link to="/#top">Back to top <ArrowUpRight size={14} /></Link></div></footer>
  </main>;
}

function ExplorePage() {
  const features = [
    { icon: Camera, title: 'AI Scan', description: 'Start a guided leaf-scan workflow with a crop photo and field location. This demo uses sample results rather than analyzing the uploaded image.' },
    { icon: Activity, title: 'Disease Detection', description: 'Review sample indicators for supported tomato leaf conditions and use them as prompts for closer inspection, not as a diagnosis.' },
    { icon: Clock3, title: 'History & Reports', description: 'Keep field scans together, filter records by status and location, and open or export the accompanying report.' },
    { icon: ShieldCheck, title: 'Accuracy Tracking', description: 'View the sample confidence attached to a demo result. It is illustrative, not a validated measure of model accuracy.' },
    { icon: CheckCircle2, title: 'Auto-Save', description: 'Saved scans are stored locally in this browser so your demo field history is available on this device.' },
  ];
  return <main className="landing-content-page explore-page">
    <header className="explore-editorial-heading"><h1>Better crop insight<br />starts in the field.</h1><p>AgroDoc brings crop photos, disease-screening workflows, and field reports together to support more informed farming decisions.</p></header>
    <div className="explore-cover" role="img" aria-label="Ripe and green tomatoes growing on the vine" />
    <section className="explore-overview"><span className="landing-kicker">OVERVIEW</span><h2>Useful insights start with a clear field record.</h2><p>AgroDoc was designed as a smart agricultural assistant to help farmers document crop changes, review potential disease indicators, and keep follow-up reports connected to where observations were made. Its mission is to support efficient and sustainable farming by bringing routine scouting details into a single workflow.</p><p>This prototype demonstrates that workflow with sample data. It does not perform validated image-based diagnosis, and all sample confidence values are illustrative.</p></section>
    <section className="explore-feature-section" id="features"><div className="explore-section-heading"><span className="landing-kicker">FEATURES</span><h2>From scan to follow-up.</h2></div><div className="explore-feature-grid">{features.map(({ icon: Icon, title, description }) => <article className="explore-feature" key={title}><span className="landing-content-icon"><Icon size={20} /></span><h3>{title}</h3><p>{description}</p></article>)}</div></section>
    <section className="explore-benefits"><span className="landing-kicker">BENEFITS</span><h2>Make more time for decisions in the field.</h2><div className="explore-benefit-grid"><article><strong>Save time</strong><p>Keep photos, locations, and notes organized instead of scattered across separate records.</p></article><article><strong>Support early follow-up</strong><p>Review observations and sample indicators sooner, then confirm concerns through field inspection.</p></article><article><strong>Make informed choices</strong><p>Use a consistent history and shareable reports to support conversations with an agronomist.</p></article><article><strong>Build sustainable habits</strong><p>Routine records can help prioritize scouting and direct attention where it is needed.</p></article></div><p className="landing-page-note"><CircleHelp size={15} /> Productivity and yield depend on many factors. AgroDoc makes no guaranteed disease-detection or crop-yield claims.</p></section>
  </main>;
}

function AboutPage() {
  return <main className="landing-content-page">
    <section className="tomato-about-cover" aria-label="Tomato growing product case">
      <div className="tomato-about-cover-copy"><span>PRODUCT CASE</span><h1>Tomato care,<br />closer to the field.</h1><p>Crop observations, scans, and field notes gathered in one place.</p></div>
    </section>
    <section className="tomato-about-intro">
      <div className="tomato-about-copy"><span className="tomato-about-kicker">ABOUT AGRODOC</span><h2>ABOUT TOMATO FIELD CARE</h2><p>Tomato crops need regular attention as they grow. AgroDoc helps growers record what they see, connect a scan to a field location, and revisit observations as part of a steady scouting routine.</p><p>Demo scan results are illustrative. They help preview the workflow and are not a crop diagnosis.</p><h3>BUILT AROUND TOMATOES</h3><div className="tomato-about-stats"><span><strong>01</strong><small>Crop focus</small></span><span><strong>06</strong><small>Sample zones</small></span><span><strong>10</strong><small>Sample plants</small></span></div></div>
      <img className="tomato-about-bowl" src="https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=760&q=85" alt="Freshly harvested red tomatoes" />
    </section>
    <section className="tomato-story-list" id="how-it-works" aria-label="How AgroDoc supports tomato growers">
      <article className="tomato-story-row"><div className="tomato-story-copy"><span className="tomato-about-kicker">FIELD OBSERVATIONS</span><h2>BETTER SCOUTING</h2><p>Keep each tomato scan connected to its field zone. Review recent observations in context and build a useful record for the next time you walk the rows.</p></div><img src="https://images.unsplash.com/photo-1592841200221-a6898f307baa?auto=format&fit=crop&w=1000&q=85" alt="Tomatoes growing on a leafy vine" loading="lazy" /></article>
      <article className="tomato-story-row reverse"><img src="https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=1000&q=85" alt="Ripe tomatoes ready to harvest" loading="lazy" /><div className="tomato-story-copy"><span className="tomato-about-kicker">FIELD RECORDS</span><h2>NO LOST FIELD NOTES</h2><p>Keep locations, dates, sample health, and reports together. A clear history makes it easier to review what changed and decide what to inspect next.</p></div></article>
      <article className="tomato-story-row"><div className="tomato-story-copy"><span className="tomato-about-kicker">GROWER WORKFLOW</span><h2>FEEL GOOD ABOUT FOLLOW-UP</h2><p>Use AgroDoc as an organized starting point for field checks, then confirm crop concerns with careful inspection and local agricultural guidance.</p><Link to="/explore" className="template-dark-button">EXPLORE AGRODOC</Link></div><img src="https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=1000&q=85" alt="A fresh harvest of tomatoes" loading="lazy" /></article>
    </section>
    <section className="tomato-about-contact"><div><span>AGRODOC · TOMATO FIELD INTELLIGENCE</span><h2>GET IN TOUCH</h2><p>Have a question about the demo workspace or your tomato scouting workflow?</p></div><Link to="/contact" className="tomato-contact-button">CONTACT AGRODOC <ArrowRight size={15} /></Link></section>
    <div className="tomato-about-map"><iframe title="Illustrative demo field location map" src="https://maps.google.com/maps?q=42.3521%2C-71.0589&z=12&output=embed" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /><span>DEMO FIELD LOCATION · SAMPLE MAP</span></div>
  </main>;
}

function TestimonialPage() {
  const testimonials = [
    { name: 'Maya Chen', role: 'Tomato grower · illustrative demo profile', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=160&q=80', quote: 'Keeping crop photos beside the field zone gives me a clearer routine for checking changes over time.' },
    { name: 'Luis Herrera', role: 'Farm manager · illustrative demo profile', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80', quote: 'Having scan history and field notes together makes it simpler to review possible disease signs.' },
    { name: 'Amina Yusuf', role: 'Grower · illustrative demo profile', image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80', quote: 'The reports give me a more organized starting point when I discuss crop observations with an agronomist.' },
  ];
  return <main className="landing-content-page testimonial-page">
    <header className="landing-page-heading"><span className="landing-kicker">TESTIMONIALS</span><h1>Built around better field habits.</h1><p>These illustrative demo stories show how organized notes can support scouting and follow-up. They are not verified customer endorsements or yield claims.</p></header>
    <div className="testimonial-card-grid">{testimonials.map((item) => <article className="testimonial-card" key={item.name}><img src={item.image} alt={`${item.name}, illustrative stock portrait`} /><blockquote>“{item.quote}”</blockquote><strong>{item.name}</strong><small>{item.role}</small></article>)}</div>
  </main>;
}

function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  async function submitContact(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    setError('');
    setSubmitted(false);
    try {
      await submitContactMessage(Object.fromEntries(new FormData(form)));
      setSubmitted(true);
      form.reset();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }
  return <main className="landing-content-page contact-page">
    <header className="landing-page-heading"><span className="landing-kicker">CONTACT</span><h1>Get in touch with AgroDoc.</h1><p>Send a note about the demo workspace or your crop-monitoring needs.</p></header>
    <div className="contact-page-grid">
      <section className="contact-details"><span className="landing-kicker">CONTACT DETAILS</span><p className="contact-demo-note">Reach the AgroDoc team using the details below.</p><a href="mailto:Agrodoc@gmail.com"><Mail size={17} /><span><small>EMAIL</small><strong>Agrodoc@gmail.com</strong></span></a><a href="tel:+915689741256"><Phone size={17} /><span><small>PHONE</small><strong>+91 5689741256</strong></span></a><div className="contact-address"><MapPin size={17} /><span><small>OFFICE</small><strong>AgroDoc Demo Office<br />123 Fieldway Road<br />Demo City, USA 00000</strong></span></div></section>
      <form className="contact-form" onSubmit={submitContact}><label htmlFor="contact-name">Name</label><input id="contact-name" name="name" autoComplete="name" required /><label htmlFor="contact-email">Email</label><input id="contact-email" name="email" type="email" autoComplete="email" required /><label htmlFor="contact-subject">Subject</label><input id="contact-subject" name="subject" required /><label htmlFor="contact-message">Message</label><textarea id="contact-message" name="message" rows="5" required /><button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Sending…' : <>Send message <ArrowRight size={15} /></>}</button>{error && <p className="contact-form-status" role="alert">{error}</p>}{submitted && <p className="contact-form-status" role="status">Your message was sent to the AgroDoc team.</p>}</form>
    </div>
  </main>;
}

function EmptyState({ icon: Icon, title, body, action }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={21} /></span><h2>{title}</h2><p>{body}</p>{action}</div>;
}

function NotFound() {
  return <EmptyState icon={Search} title="Page not found" body="The page you’re looking for isn’t here." action={<Link to="/" className="button button-primary">Go to overview</Link>} />;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function relativeDate(value) {
  return formatDateTime(value);
}
