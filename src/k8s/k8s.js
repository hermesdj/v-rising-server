import k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

export const client = kc.makeApiClient(k8s.CoreV1Api);
export const exec = new k8s.Exec(kc);
