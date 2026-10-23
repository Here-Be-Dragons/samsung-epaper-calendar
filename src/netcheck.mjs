/**
 * Spots a PUBLIC_HOST the panel cannot use. The panel fetches its pictures from this address, so it must be on the panel's
 * own network: a VPN or office address (or localhost, or a Docker bridge address) is unreachable from it.
 */
const subnet = (ip) => /^(\d+\.\d+\.\d+)\.\d+$/.exec(ip ?? '')?.[1] ?? null;

/** @returns {string[]} plain-language warnings (empty when nothing looks wrong) */
export function publicUrlWarnings(url, displayHosts = []) {
  const warnings = [];
  const host = new URL(url).hostname;
  if (/^(localhost|127\.|0\.0\.0\.0|::1)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    warnings.push(`Panels are told to fetch from ${url}, which a panel on your LAN cannot reach (it looks like localhost or a Docker address). Set PUBLIC_HOST to this machine's LAN IP, or run the container with network_mode: host.`);
    return warnings;
  }
  const mine = subnet(host);
  for (const panel of displayHosts) {
    const theirs = subnet(panel);
    if (mine && theirs && mine !== theirs) {
      warnings.push(`Panels are told to fetch from ${url}, but the panel at ${panel} is on ${theirs}.x: ${host} is probably a VPN or another network's address that it cannot reach. Set PUBLIC_HOST to this machine's address on ${theirs}.x.`);
    }
  }
  const length = `${url}/api/display-content/${'X'.repeat(36)}/content.json`.length;
  if (length > 254) warnings.push(`The content URL would be ${length} bytes; the panel accepts at most 254. Use a shorter PUBLIC_URL.`);
  return warnings;
}
