/**
 * Home Assistant over MQTT, in the style of ESPHome: the display shows up as a device with sensors
 * (is a redraw pending, since when, last redraw, counts) and controls (buttons to redraw, a layout
 * picker), found automatically through MQTT discovery. All the logic about WHEN to redraw stays in
 * Home Assistant automations; this only reports and obeys.
 *
 * Topics (prefix = MQTT_TOPIC_PREFIX, default "samsung-epaper-calendar"):
 *   <prefix>/availability               online / offline (last will)
 *   <prefix>/<display>/state            JSON status, retained
 *   <prefix>/<display>/set/refresh      any payload: fetch calendars, redraw if changed
 *   <prefix>/<display>/set/redraw       any payload: redraw now even if unchanged
 *   <prefix>/<display>/set/check        any payload: fetch calendars and update the pending flag only
 *   <prefix>/<display>/set/battery      any payload: wake the panel if needed, read its battery, let it sleep
 *   <prefix>/<display>/set/sleep        any payload: put the panel to sleep (only if it can be woken again)
 *   <prefix>/<display>/set/layout       a layout name (retained, so the choice survives a restart)
 *   <prefix>/<display>/set/theme        auto, none, or a theme name (retained)
 */
import mqtt from 'mqtt';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const PHASES = { connecting: 'connecting to the panel', waking: 'waking the panel', pushing: 'sending the picture', waiting: 'waiting for the panel to fetch it', settling: 'panel refreshing', sleeping: 'putting the panel to sleep' };

/** The retained JSON the sensors read from. */
export function stateJson(status) {
  return JSON.stringify({
    pending: status.pending ? 'ON' : 'OFF',
    pending_since: status.pendingSince,
    last_checked: status.lastCheckAt,
    last_redraw: status.lastPushAt,
    layout: status.layout,
    theme: status.theme,
    theme_active: status.themeActive,
    mode: status.mode,
    events_today: status.eventsToday,
    shopping_open: status.shoppingOpen,
    feed_problem: status.feedsOk === null ? null : status.feedsOk ? 'OFF' : 'ON',
    push_problem: status.lastPushOk === null ? 'OFF' : status.lastPushOk ? 'OFF' : 'ON',
    status: status.phase !== 'idle' ? PHASES[status.phase] ?? status.phase : status.pending ? (status.lastPushOk === false ? 'redraw failed' : 'redraw pending') : 'up to date',
    battery: status.battery?.percent ?? null,
    power_source: status.battery ? status.battery.source || 'battery' : null,
    battery_days_left: status.batteryDaysLeft,
    panel_state: status.panelState,
    last_wake_seconds: status.lastWakeSeconds,
    note: status.note || '',
    last_error: status.lastPushReason || '',
  });
}

/** Discovery messages [{ topic, payload }] that make Home Assistant create the device and its entities. */
export function discoveryMessages({ display, prefix, discoveryPrefix, layouts, themes }) {
  const node = `samsung_epaper_calendar_${slug(display.id)}`;
  const base = `${prefix}/${display.id}`;
  const device = {
    identifiers: [node],
    name: `Calendar ${display.id}`,
    manufacturer: 'Samsung EMDX e-paper',
    model: 'samsung-epaper-calendar',
  };
  const common = (key, name, extra = {}) => ({
    name,
    unique_id: `${node}_${key}`,
    device,
    availability_topic: `${prefix}/availability`,
    has_entity_name: true,
    ...extra,
  });
  // null in the JSON becomes an unknown state rather than the text "None".
  const fromState = (field) => ({ state_topic: `${base}/state`, value_template: `{{ value_json.${field} if value_json.${field} is not none else None }}` });
  const msg = (component, key, payload) => ({ topic: `${discoveryPrefix}/${component}/${node}/${key}/config`, payload: JSON.stringify(payload) });
  const button = (key, name, command, icon) => msg('button', key, common(key, name, { command_topic: `${base}/set/${command}`, payload_press: 'PRESS', icon }));

  return [
    msg('binary_sensor', 'redraw_pending', common('redraw_pending', 'Redraw pending', { ...fromState('pending'), icon: 'mdi:image-refresh' })),
    msg('sensor', 'status', common('status', 'Status', { ...fromState('status'), icon: 'mdi:calendar-sync' })),
    msg('sensor', 'pending_since', common('pending_since', 'Pending since', { ...fromState('pending_since'), device_class: 'timestamp' })),
    msg('sensor', 'last_redraw', common('last_redraw', 'Last redraw', { ...fromState('last_redraw'), device_class: 'timestamp' })),
    msg('sensor', 'last_checked', common('last_checked', 'Last checked', { ...fromState('last_checked'), device_class: 'timestamp', entity_category: 'diagnostic' })),
    msg('sensor', 'events_today', common('events_today', 'Events today', { ...fromState('events_today'), icon: 'mdi:calendar-today', state_class: 'measurement' })),
    msg('sensor', 'shopping_open', common('shopping_open', 'Shopping items', { ...fromState('shopping_open'), icon: 'mdi:cart', state_class: 'measurement' })),
    msg('binary_sensor', 'feed_problem', common('feed_problem', 'Calendar feed problem', { ...fromState('feed_problem'), device_class: 'problem', entity_category: 'diagnostic' })),
    msg('binary_sensor', 'push_problem', common('push_problem', 'Panel update problem', { ...fromState('push_problem'), device_class: 'problem', entity_category: 'diagnostic' })),
    button('refresh', 'Refresh', 'refresh', 'mdi:calendar-refresh'),
    button('redraw', 'Redraw now', 'redraw', 'mdi:monitor-shimmer'),
    button('check', 'Check for changes', 'check', 'mdi:magnify'),
    msg('sensor', 'battery', common('battery', 'Battery', { ...fromState('battery'), device_class: 'battery', unit_of_measurement: '%', state_class: 'measurement' })),
    msg('sensor', 'power_source', common('power_source', 'Power source', { ...fromState('power_source'), icon: 'mdi:power-plug-battery' })),
    msg('sensor', 'battery_days_left', common('battery_days_left', 'Battery days left', { ...fromState('battery_days_left'), unit_of_measurement: 'd', icon: 'mdi:battery-clock', state_class: 'measurement' })),
    msg('sensor', 'panel_state', common('panel_state', 'Panel state', { ...fromState('panel_state'), icon: 'mdi:sleep' })),
    msg('sensor', 'last_wake_seconds', common('last_wake_seconds', 'Last wake time', { ...fromState('last_wake_seconds'), unit_of_measurement: 's', icon: 'mdi:timer-sand', entity_category: 'diagnostic' })),
    button('check_battery', 'Check battery', 'battery', 'mdi:battery-search'),
    button('sleep', 'Sleep panel', 'sleep', 'mdi:power-sleep'),
    msg('select', 'theme', common('theme', 'Theme', { ...fromState('theme'), command_topic: `${base}/set/theme`, options: themes, retain: true, icon: 'mdi:palette' })),
    msg('sensor', 'theme_active', common('theme_active', 'Active theme', { ...fromState('theme_active'), icon: 'mdi:palette-swatch' })),
    msg('select', 'layout', common('layout', 'Layout', { ...fromState('layout'), command_topic: `${base}/set/layout`, options: layouts, retain: true, icon: 'mdi:view-dashboard' })),
  ];
}

/**
 * Connects, announces the displays, publishes every state change and runs commands.
 * Returns { close }. The broker password is never logged.
 */
export function startMqtt({ url, username, password, prefix, discoveryPrefix, displays, layouts, themes, controller }) {
  const byId = new Map(displays.map((d) => [d.id, d]));
  const client = mqtt.connect(url, {
    username: username || undefined,
    password: password || undefined,
    clientId: `${prefix}-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 5000,
    will: { topic: `${prefix}/availability`, payload: 'offline', retain: true, qos: 1 },
  });

  const publishState = (status) => client.publish(`${prefix}/${status.id}/state`, stateJson(status), { retain: true, qos: 1 });

  client.on('connect', () => {
    console.log(` \u{1F3E0} MQTT connected to ${safeUrl(url)}; Home Assistant discovery under ${discoveryPrefix}/`);
    client.publish(`${prefix}/availability`, 'online', { retain: true, qos: 1 });
    for (const display of displays) {
      for (const m of discoveryMessages({ display, prefix, discoveryPrefix, layouts, themes })) client.publish(m.topic, m.payload, { retain: true, qos: 1 });
      publishState(controller.status(display.id));
      client.subscribe([`${prefix}/${display.id}/set/#`], { qos: 1 });
    }
  });
  client.on('error', (err) => console.warn(`[mqtt] ${err.message}`));
  client.on('reconnect', () => console.log(' [mqtt] reconnecting...'));
  controller.events.on('state', (status) => { if (client.connected) publishState(status); });

  client.on('message', (topic, payload) => {
    const [, id, , command] = topic.slice(prefix.length).split('/');
    const display = byId.get(id);
    if (!display) return;
    const text = payload.toString().trim();
    const run = (label, job) => {
      console.log(` \u{1F3E0} [${id}] MQTT command: ${label}`);
      job.catch((err) => console.error(`[mqtt:${id}] ${label} failed: ${err.message}`));
    };
    if (command === 'refresh') run('refresh', controller.refresh(display));
    else if (command === 'redraw') run('redraw', controller.redraw(display));
    else if (command === 'check') run('check', controller.check(display, { fresh: true }));
    else if (command === 'battery') run('battery check', controller.checkBattery(display));
    else if (command === 'sleep') run('sleep', controller.sleepPanel(display));
    else if (command === 'layout') run(`layout ${text}`, controller.setLayout(display, text.toLowerCase()));
    else if (command === 'theme') run(`theme ${text}`, controller.setTheme(display, text.toLowerCase()));
  });

  return { close: () => new Promise((resolve) => client.end(false, {}, resolve)) };
}

/** The broker address without any credentials in it. */
function safeUrl(url) {
  try { const u = new URL(url); return `${u.protocol}//${u.host}`; } catch { return 'broker'; }
}
