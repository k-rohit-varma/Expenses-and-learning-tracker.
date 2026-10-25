const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
export async function api(path, options={}) {
  const { headers={}, ...requestOptions } = options;
  const res = await fetch(`${BASE}${path}`, { credentials:'include', ...requestOptions, headers:{'Content-Type':'application/json',...headers} });
  if (!res.ok) { const body=await res.json().catch(()=>({})); const error=new Error(body.error||`Request failed (${res.status})`); error.status=res.status; error.code=body.code; throw error; }
  if (res.status===204) return null;
  return res.json();
}
export function qs(values={}) { const p=new URLSearchParams(); for(const [k,v] of Object.entries(values)) if(v!==''&&v!==undefined&&v!==null)p.set(k,v); const out=p.toString();return out?`?${out}`:''; }
