// ICE servers for WebRTC. STUN finds a direct route; TURN relays video when no
// direct route exists (strict firewalls, mobile networks, different offices).
import crypto from 'node:crypto';
import { config } from './config.js';

export function iceServers(identity = 'oversee') {
  const servers = [];
  if (config.ice.stun.length) servers.push({ urls: config.ice.stun });
  if (config.ice.turn.length) {
    if (config.ice.turnSecret) {
      // coturn "use-auth-secret" REST credentials, valid for 12 hours.
      const username = `${Math.floor(Date.now() / 1000) + 12 * 3600}:${identity}`;
      const credential = crypto.createHmac('sha1', config.ice.turnSecret).update(username).digest('base64');
      servers.push({ urls: config.ice.turn, username, credential });
    } else if (config.ice.turnUsername) {
      servers.push({ urls: config.ice.turn, username: config.ice.turnUsername, credential: config.ice.turnCredential });
    }
  }
  return servers;
}
