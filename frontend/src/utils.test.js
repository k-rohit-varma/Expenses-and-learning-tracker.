import { describe,expect,it } from 'vitest';
function fmt(minutes){return `${Math.floor(minutes/60)?`${Math.floor(minutes/60)}h `:''}${minutes%60?`${minutes%60}m`:minutes<60?`${minutes}m`:''}`.trim();}
describe('duration formatting',()=>{it('formats minutes and hours without losing remainder',()=>{expect(fmt(30)).toBe('30m');expect(fmt(90)).toBe('1h 30m');expect(fmt(120)).toBe('2h');});});
