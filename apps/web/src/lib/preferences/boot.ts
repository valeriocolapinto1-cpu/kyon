import { DEFAULT_PREFERENCES } from '@kyon/core';
import { LITE_DETECTED_KEY, PREFERENCES_KEY } from './storage';

/**
 * Inline script run in <head> before first paint, so the right theme is applied with no flash.
 * It mirrors `resolveHtmlAttributes` from @kyon/core (a test keeps the two in sync).
 * Kept tiny and dependency-free on purpose.
 */
export const BOOT_SCRIPT = `(function(){try{
var d=document.documentElement,m=function(q){return window.matchMedia(q).matches},p={};
try{p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFERENCES_KEY)})||'{}')||{}}catch(e){}
var D=${JSON.stringify(DEFAULT_PREFERENCES)};
var A=${JSON.stringify(['red', 'orange', 'yellow', 'green', 'mint', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink'])};
var g=function(k,a){return a.indexOf(p[k])>=0?p[k]:D[k]};
var o=function(v,s){return v==='on'||(v==='system'&&s)?'on':'off'};
var t=g('theme',['system','light','dark']),c=g('contrast',['system','normal','high']),l=g('lite',['auto','on','off']);
var lite=false;try{lite=localStorage.getItem(${JSON.stringify(LITE_DETECTED_KEY)})==='1'}catch(e){}
var s={'data-accent':g('accent',A),
'data-scheme':t==='system'?(m('(prefers-color-scheme: dark)')?'dark':'light'):t,
'data-contrast':c==='system'?(m('(prefers-contrast: more)')?'high':'normal'):c,
'data-reduce-motion':o(g('reduceMotion',['system','on','off']),m('(prefers-reduced-motion: reduce)')),
'data-reduce-transparency':o(g('reduceTransparency',['system','on','off']),m('(prefers-reduced-transparency: reduce)')),
'data-lite':l==='on'||(l==='auto'&&lite)?'on':'off',
'data-non-color':p.nonColor===true?'on':'off'};
for(var k in s)d.setAttribute(k,s[k]);
if(typeof p.textScale==='number'&&isFinite(p.textScale)){var z=Math.min(1.6,Math.max(0.85,p.textScale));d.setAttribute('data-text-scale',String(z));d.style.setProperty('--k-text-scale',String(z))}
}catch(e){}})();`;
