/**
 * Shared service registry — avoids the singleton bug where routes
 * create their own unstarted instances of services.
 *
 * server.js registers after creating instances; routes call getService().
 */
const services = new Map();

export function registerService(name, instance) {
  services.set(name, instance);
}

export function getService(name) {
  const svc = services.get(name);
  if (!svc) throw new Error(`Service "${name}" not registered. Was server.js started?`);
  return svc;
}
