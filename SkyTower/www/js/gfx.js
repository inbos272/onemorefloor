// Dependency-free WebGL2 renderer. Everything is instanced so a frame stays near 15 draw calls.
(function () {
  'use strict';
  const S = window.SKY;
  const C = S.CFG;
  const HEAD = '#version 300 es\nprecision highp float;\n';

  const LIT = `
uniform vec3 uEye,uSunD,uSunC,uHemiS,uHemiG,uFog;
uniform vec2 uFogR;
uniform float uLavaY,uLavaG;
vec3 lit(vec3 al,vec3 N,vec3 P,float gloss,float em){
  vec3 V=normalize(uEye-P);
  float nl=dot(N,uSunD);
  float w=clamp((nl+.4)/1.4,0.,1.);
  vec3 c=mix(uHemiG,uHemiS,N.y*.5+.5)*.72+uSunC*w*w*.72;
  float lh=max(P.y-uLavaY,0.);
  float up=clamp(.6-N.y*.7,0.,1.);
  c+=vec3(1.5,.55,.14)*uLavaG*exp(-lh*.1)*up;
  vec3 H=normalize(V+uSunD);
  float sp=pow(max(dot(N,H),0.),mix(14.,110.,gloss))*gloss*.9;
  float rim=pow(1.-max(dot(N,V),0.),3.);
  vec3 col=al*c+uSunC*sp+uHemiS*rim*.16+al*em;
  float f=smoothstep(uFogR.x,uFogR.y,length(P-uEye));
  return mix(col,uFog,f);
}`;
  const HASH = `float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}`;

  const RIGID_VS = HEAD + `
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNor;
layout(location=3) in vec4 r0;layout(location=4) in vec4 r1;layout(location=5) in vec4 r2;
layout(location=6) in vec4 iCol;layout(location=7) in vec4 iExt;
uniform mat4 uVP;out vec3 vN,vW;out vec4 vC,vE;
void main(){vec4 p=vec4(aPos,1.);vec3 w=vec3(dot(r0,p),dot(r1,p),dot(r2,p));
vec3 a=vec3(r0.x,r1.x,r2.x),b=vec3(r0.y,r1.y,r2.y),c=vec3(r0.z,r1.z,r2.z);
vN=a*aNor.x/dot(a,a)+b*aNor.y/dot(b,b)+c*aNor.z/dot(c,c);vW=w;vC=iCol;vE=iExt;gl_Position=uVP*vec4(w,1.);}`;
  const RIGID_FS = HEAD + LIT + `
in vec3 vN,vW;in vec4 vC,vE;out vec4 o;
void main(){vec3 N=normalize(vN);o=vec4(lit(vC.rgb,N,vW,vE.x,vC.a),1.);}`;

  const PLAT_VS = HEAD + `
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNor;layout(location=2) in vec2 aUv;
layout(location=3) in vec4 iA;layout(location=4) in vec4 iB;
uniform mat4 uVP;uniform float uR;
out vec3 vN,vW,vL,vNL;flat out vec4 vA;
void main(){
  float sc=iB.x;
  float s=(aPos.x*(iA.y-.22)+aUv.x)*sc;
  float y=aPos.y*sc+s*iB.y;
  float r=uR+aPos.z*sc;
  float th=iA.x+s/uR;
  float sn=sin(th),cs=cos(th);
  vec3 T=vec3(cs,0.,-sn),Rd=vec3(sn,0.,cs);
  vW=vec3(r*sn,y+iA.z,r*cs);
  vN=T*aNor.x+vec3(0.,1.,0.)*aNor.y+Rd*aNor.z;
  vNL=aNor;vL=vec3(s,aPos.y,aPos.z);vA=vec4(iA.w,iB.z,iB.w,iA.y);
  gl_Position=uVP*vec4(vW,1.);}`;
  const PLAT_FS = HEAD + LIT + HASH + `
in vec3 vN,vW,vL,vNL;flat in vec4 vA;out vec4 o;
uniform vec3 uThA,uThB,uThS,uCamDir;uniform vec4 uThP,uShadow;uniform float uThE,uTime;
void main(){
  int t=int(vA.x+.5);bool top=vNL.y>.75;
  float s=vL.x,z=vL.z,y=vL.y,fl=vA.y;
  vec3 al;float gl=.06,em=0.;
  float band=smoothstep(.07,.0,abs(y+.44));
  if(t==0){
    float sx=s+vA.z*37.;
    if(top){float st=smoothstep(.35,.65,sin(sx*uThP.x+sin(z*1.7)*.8)*.5+.5);al=mix(uThA,uThB,st*uThP.y);
      al*=1.+(vn(vec2(sx,z)*3.2)-.5)*uThP.z*.55;}
    else{float lip=smoothstep(-.2,-.12,y+.05*sin(sx*5.));al=mix(uThS,uThA,lip);al*=mix(.62,1.,clamp((y+.85)/.7,0.,1.));}
    gl=uThP.w;
    if(uThE>0.){float e=smoothstep(1.16,1.42,abs(z))+smoothstep(vA.w-.5,vA.w-.15,abs(s))+band;
      vec3 g=mix(uThB*2.3,vec3(.25,.95,1.),step(.9,uThE));em=0.;al=mix(al,g,clamp(e,0.,1.)*uThE*.8);if(e>.1)em=uThE*.7*clamp(e,0.,1.);}
  }else if(t==1){
    float q=smoothstep(.25,.8,sin(s*2.1+z*3.3)*.5+.5);
    al=top?mix(vec3(.55,.87,1.),vec3(.92,.99,1.),q):mix(vec3(.3,.62,.92),vec3(.62,.9,1.),band);gl=1.;em=.1;
  }else if(t==2){
    float c=fract(abs(s)*.55+abs(z)*.25-uTime*1.15);float ch=smoothstep(.0,.08,c)*smoothstep(.5,.42,c);
    al=top?mix(vec3(.2,.82,.34),vec3(.88,1.,.48),ch):mix(vec3(.1,.5,.24),vec3(.55,1.,.45),band);em=top?ch*.32:band*.5;gl=.25;
  }else if(t==3){
    float c=abs(sin(s*3.1+sin(z*2.3)*1.4))*abs(sin(s*1.7-z*2.9+1.3+vA.z*9.));
    float cr=smoothstep(.13,.04,c);
    al=top?vec3(.83,.67,.47):vec3(.56,.42,.3);al=mix(al,vec3(.2,.13,.1),cr*(top?.95:.6));
    al=mix(al,vec3(.95,.35,.2),fl*cr);em=fl*cr*.8;
  }else if(t==4){
    float c=fract(s*.75-uTime*2.1-abs(z)*.42);float ch=smoothstep(.0,.07,c)*smoothstep(.48,.4,c);
    al=top?mix(vec3(.24,.3,.95),vec3(.42,.95,1.),ch):mix(vec3(.15,.17,.6),vec3(.42,.95,1.),band);em=top?ch*.55:band*.8;gl=.5;
  }else{
    float c=step(.5,fract((s+z*.8)*.62));
    al=top?mix(vec3(.13,.1,.12),vec3(.96,.2,.14),c):mix(vec3(.13,.1,.12),vec3(1.,.34,.15),band);
    al=mix(al,vec3(1.,.82,.3),fl*.72);em=fl*.95+(top?c*.1:band*.5);gl=.2;
  }
  if(top){vec2 d=vW.xz-uShadow.xz;float h=uShadow.y-vW.y;
    if(h>-.06){float r=.62+h*.09;float k=smoothstep(r*1.55,r*.3,length(d))*uShadow.w*clamp(1.-h/13.,0.,1.);al*=1.-k*.62;}
    float e=smoothstep(1.5,1.1,abs(z));al*=mix(.9,1.,e);}
  vec3 N=normalize(vN);
  vec3 col=lit(al,N,vW,gl,em);
  float b=dot(normalize(vW.xz),uCamDir.xz);
  col=mix(col,uFog,smoothstep(.15,-.9,b)*.68);
  o=vec4(col,1.);}`;

  const SHADOW_VS = HEAD + `
layout(location=0) in vec3 aPos;
layout(location=3) in vec4 iA;layout(location=4) in vec4 iB;
uniform mat4 uVP;uniform float uR,uRc;out vec2 vP;
void main(){
  float s=aPos.x*(iA.y+.5)*iB.x;
  float th=iA.x+s/uR;
  float r=uRc+.03;
  vP=vec2(aPos.x,aPos.y);
  gl_Position=uVP*vec4(r*sin(th),iA.z-1.5+aPos.y*2.2,r*cos(th),1.);}`;
  const SHADOW_FS = HEAD + `in vec2 vP;out vec4 o;uniform float uA;
void main(){float e=smoothstep(1.,.45,abs(vP.x))*smoothstep(1.,.2,abs(vP.y));o=vec4(0.,0.,0.,e*uA);}`;

  const COL_VS = HEAD + `
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNor;
uniform mat4 uVP;uniform float uRc;out vec3 vW,vN;
void main(){vW=vec3(aPos.x*uRc,aPos.y*140.,aPos.z*uRc);vN=aNor;gl_Position=uVP*vec4(vW,1.);}`;
  const COL_FS = HEAD + LIT + HASH + `
in vec3 vW,vN;out vec4 o;uniform vec3 uColA,uColB;uniform float uYOff;
void main(){float a=atan(vW.x,vW.z);float y=vW.y+uYOff;
float row=floor(y/2.4);float u=a*2.546+mod(row,2.)*.5;
float fy=fract(y/2.4),fu=fract(u);
float g=smoothstep(0.,.05,fy)*smoothstep(1.,.95,fy)*smoothstep(0.,.03,fu)*smoothstep(1.,.97,fu);
float tone=h21(vec2(floor(u),row));
vec3 al=mix(uColA,uColB,tone*.6)*mix(.66,.86,g);
o=vec4(lit(al,normalize(vN),vW,.04,0.),1.);}`;

  const SKY_VS = HEAD + `uniform vec3 uRight,uUp,uFwd;out vec3 vRay;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2))*2.-1.;
vRay=uFwd+uRight*p.x+uUp*p.y;gl_Position=vec4(p,.9999,1.);}`;
  const SKY_FS = HEAD + `
in vec3 vRay;out vec4 o;uniform vec3 uTop,uMid,uHor,uSunV,uSunCol;uniform float uStars,uTime;
float h31(vec3 p){return fract(sin(dot(p,vec3(12.98,78.23,37.72)))*43758.5453);}
void main(){vec3 d=normalize(vRay);float h=d.y;
vec3 c=h>.08?mix(uMid,uTop,pow(clamp((h-.08)/.72,0.,1.),.75)):mix(uHor,uMid,smoothstep(-.42,.08,h));
float sd=max(dot(d,uSunV),0.);
c+=uSunCol*(pow(sd,7.)*.26+pow(sd,70.)*.45+smoothstep(.9975,.9985,sd)*.85);
if(uStars>.01){vec3 p=d*150.;vec3 i=floor(p);float r=h31(i);
 if(r>.985){float b=(r-.985)/.015;float tw=.65+.35*sin(uTime*2.+r*90.);float l=length(fract(p)-.5);c+=vec3(.9,.95,1.)*smoothstep(.42,.05,l)*b*tw*uStars;}
 float n=sin(d.x*5.+sin(d.y*7.)*1.5)*sin(d.z*4.+d.y*3.);c+=vec3(.35,.1,.5)*smoothstep(.15,.95,n)*.5*uStars;
 float n2=sin(d.z*6.+1.+sin(d.x*5.))*sin(d.y*6.-d.x);c+=vec3(.05,.25,.5)*smoothstep(.3,1.,n2)*.5*uStars;}
o=vec4(c,1.);}`;

  const LAVA_VS = HEAD + `
layout(location=0) in vec3 aPos;
uniform mat4 uVP;uniform float uLavaY,uTime;uniform vec2 uCenter;out vec3 vW;
void main(){vec2 xz=aPos.xz*84.;float w=sin(xz.x*.32+uTime*1.4)*.2+sin(xz.y*.27-uTime*1.1)*.2+sin((xz.x+xz.y)*.6+uTime*2.)*.08;
vW=vec3(xz.x,uLavaY+w,xz.y);gl_Position=uVP*vec4(vW,1.);}`;
  const LAVA_FS = HEAD + HASH + `
in vec3 vW;out vec4 o;uniform float uTime;uniform vec3 uEye,uFog;
void main(){vec2 p=vW.xz*.15;float t=uTime;
float n=vn(p+vec2(t*.2,t*.12))*.64+vn(p*2.4-vec2(t*.28,-t*.2))*.36;
float cr=smoothstep(.44,.6,n);
vec3 hot=mix(vec3(1.,.86,.3),vec3(1.,.38,.05),smoothstep(.2,.46,n));
vec3 c=mix(hot*1.2,vec3(.23,.05,.05),cr*.93);
float v=clamp(1.-abs(n-.5)*20.,0.,1.);c+=vec3(1.,.48,.08)*v*.8;
float rad=length(vW.xz);
c=mix(c,vec3(1.,.5,.14),smoothstep(26.,62.,rad)*.8);
o=vec4(c,1.-smoothstep(34.,78.,rad));}`;

  const PART_VS = HEAD + `
layout(location=2) in vec2 aUv;
layout(location=3) in vec4 iP;layout(location=4) in vec4 iC;
uniform mat4 uVP;uniform vec3 uRight,uUp;out vec2 vUv;out vec4 vC;
void main(){vUv=aUv;vC=iC;vec3 w=iP.xyz+(uRight*(aUv.x-.5)+uUp*(aUv.y-.5))*iP.w;gl_Position=uVP*vec4(w,1.);}`;
  const PART_FS = HEAD + `
in vec2 vUv;in vec4 vC;out vec4 o;
void main(){float d=length(vUv-.5)*2.;float m=smoothstep(1.,.15,d);float a=abs(vC.a)*m;float add=step(vC.a,0.);
o=vec4(vC.rgb*a,a*(1.-add));}`;

  const POST_VS = HEAD + `out vec2 vUv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
  const POST_FS = HEAD + `
in vec2 vUv;out vec4 o;uniform sampler2D uT;uniform float uTime,uHeat,uLavaS,uWarn,uFlash,uDist;uniform vec3 uFlashC;
void main(){vec2 uv=vUv;
float m=uHeat*uDist*smoothstep(uLavaS+.5,uLavaS-.02,uv.y);
if(m>.001){uv.x+=(sin(uv.y*72.+uTime*7.)*.0038+sin(uv.y*31.-uTime*4.3)*.0032)*m;uv.y+=cos(uv.x*56.+uTime*6.)*.0024*m;}
vec3 c=texture(uT,uv).rgb;
float g=smoothstep(uLavaS+.55,uLavaS-.1,vUv.y);c+=vec3(.6,.17,.02)*g*uHeat*.36;
vec2 q=vUv-.5;float vg=dot(q,q);c*=1.-vg*.34;
c+=vec3(.75,.13,.02)*uWarn*pow(vg*1.9,1.4)*(.8+.2*sin(uTime*8.));
c=mix(c,uFlashC,uFlash);
o=vec4(c,1.);}`;

  // ---------- geometry ----------
  function lathe(prof, seg, flat, zAxis) {
    const v = [], idx = [];
    for (let i = 0; i + 1 < prof.length; i++) {
      const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
      let nr = y1 - y0, ny = -(r1 - r0);
      const l = Math.hypot(nr, ny) || 1;
      nr /= l; ny /= l;
      const base = v.length / 8;
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * S.TAU, sn = Math.sin(a), cs = Math.cos(a);
        const am = ((k + 0.5) / seg) * S.TAU;
        const nsn = flat ? Math.sin(am) : sn, ncs = flat ? Math.cos(am) : cs;
        const p0 = [r0 * sn, y0, r0 * cs], p1 = [r1 * sn, y1, r1 * cs];
        const n = [nr * nsn, ny, nr * ncs];
        if (zAxis) {
          v.push(p0[0], p0[2], p0[1], n[0], n[2], n[1], 0, 0, p1[0], p1[2], p1[1], n[0], n[2], n[1], 0, 0);
        } else {
          v.push(...p0, ...n, 0, 0, ...p1, ...n, 0, 0);
        }
      }
      for (let k = 0; k < seg; k++) {
        const a = base + k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    return { v, i: idx };
  }
  function sphere(lat, lon) {
    const v = [], idx = [];
    for (let j = 0; j <= lat; j++) {
      const t = (j / lat) * Math.PI, sy = Math.cos(t), r = Math.sin(t);
      for (let i = 0; i <= lon; i++) {
        const a = (i / lon) * S.TAU, x = r * Math.sin(a), z = r * Math.cos(a);
        v.push(x, sy, z, x, sy, z, i / lon, j / lat);
      }
    }
    for (let j = 0; j < lat; j++)
      for (let i = 0; i < lon; i++) {
        const a = j * (lon + 1) + i, b = a + lon + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    return { v, i: idx };
  }
  function rbox(r) {
    const co = [-1, -1 + r * 0.45, -1 + r, 1 - r, 1 - r * 0.45, 1], n = co.length;
    const v = [], idx = [];
    const inner = (x) => Math.max(-(1 - r), Math.min(1 - r, x));
    const faces = [
      [(u, w) => [u, w, 1]], [(u, w) => [-u, w, -1]], [(u, w) => [1, w, -u]],
      [(u, w) => [-1, w, u]], [(u, w) => [u, 1, -w]], [(u, w) => [u, -1, w]],
    ];
    for (const [f] of faces) {
      const base = v.length / 8;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const p = f(co[i], co[j]);
          const q = [inner(p[0]), inner(p[1]), inner(p[2])];
          let d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
          const l = Math.hypot(d[0], d[1], d[2]) || 1;
          d = [d[0] / l, d[1] / l, d[2] / l];
          v.push(q[0] + d[0] * r, q[1] + d[1] * r, q[2] + d[2] * r, d[0], d[1], d[2], 0, 0);
        }
      for (let j = 0; j + 1 < n; j++)
        for (let i = 0; i + 1 < n; i++) {
          const a = base + j * n + i, b = a + n;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    return { v, i: idx };
  }
  function torus(seg, tube, rr) {
    const v = [], idx = [];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * S.TAU, ca = Math.cos(a), sa = Math.sin(a);
      for (let i = 0; i <= tube; i++) {
        const b = (i / tube) * S.TAU, cb = Math.cos(b), sb = Math.sin(b);
        const nx = sa * cb, ny = sb, nz = ca * cb;
        v.push(sa * (1 + rr * cb), rr * sb, ca * (1 + rr * cb), nx, ny, nz, 0, 0);
      }
    }
    for (let j = 0; j < seg; j++)
      for (let i = 0; i < tube; i++) {
        const a = j * (tube + 1) + i, b = a + tube + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    return { v, i: idx };
  }
  function slab() {
    // Rounded slab, top surface at y=0. x stores the "stretch" coordinate; uv.x stores fixed bevel offset.
    const D = 1.5, Dlow = 1.15, H = 0.85, b = 0.16;
    const sec = [[-D + b, 0, 0, 1], [D - b, 0, 0, 1]];
    for (let i = 1; i <= 3; i++) {
      const a = (i / 3) * (Math.PI / 2);
      sec.push([D - b + b * Math.sin(a), -b + b * Math.cos(a), Math.sin(a), Math.cos(a)]);
    }
    const sl = Math.hypot(H - b, D - Dlow);
    const sn = [(H - b) / sl, -(D - Dlow) / sl];
    sec.push([D, -b, sn[0], sn[1]], [Dlow, -H, sn[0], sn[1]], [Dlow, -H, 0, -1], [-Dlow, -H, 0, -1], [-Dlow, -H, -sn[0], sn[1]], [-D, -b, -sn[0], sn[1]]);
    for (let i = 3; i >= 1; i--) {
      const a = (i / 3) * (Math.PI / 2);
      sec.push([-(D - b + b * Math.sin(a)), -b + b * Math.cos(a), -Math.sin(a), Math.cos(a)]);
    }
    const N = sec.length, v = [], idx = [];
    const be = 0.22;
    const ring = (sx, ang, side) => {
      const ca = Math.cos(ang), sa = Math.sin(ang), inset = be * (1 - ca), ex = side * be * sa;
      for (const [z, y, nz, ny] of sec) v.push(sx, y - ny * inset, z - nz * inset, side * sa, ny * ca, nz * ca, ex, 0);
    };
    const rings = [];
    const addRing = (sx, ang, side) => { ring(sx, ang, side); rings.push(1); };
    addRing(-1, Math.PI / 2 * 0.98, -1);
    addRing(-1, Math.PI / 4, -1);
    for (let i = 0; i <= 8; i++) addRing(-1 + (i / 8) * 2, 0, i === 0 ? -1 : 1);
    addRing(1, Math.PI / 4, 1);
    addRing(1, Math.PI / 2 * 0.98, 1);
    const R = rings.length;
    for (let j = 0; j + 1 < R; j++)
      for (let i = 0; i < N; i++) {
        const a = j * N + i, b2 = j * N + (i + 1) % N, c = a + N, d = b2 + N;
        idx.push(a, c, b2, c, d, b2);
      }
    for (const [cap, side] of [[0, -1], [R - 1, 1]]) {
      const base = v.length / 8;
      v.push(side, -H / 2, 0, side, 0, 0, side * be, 0);
      for (let i = 0; i < N; i++) idx.push(base, cap * N + i, cap * N + (i + 1) % N);
    }
    return { v, i: idx };
  }
  function grid(n) {
    const v = [], idx = [];
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) v.push((i / n) * 2 - 1, 0, (j / n) * 2 - 1, 0, 1, 0, i / n, j / n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + n + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    return { v, i: idx };
  }
  function strip(n) {
    const v = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * 2 - 1;
      v.push(x, -1, 0, 0, 0, 1, 0, 0, x, 1, 0, 0, 0, 1, 0, 0);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    return { v, i: idx };
  }

  const MESH = (S.MESH = { SPHERE: 0, RBOX: 1, CYL: 2, CONE: 3, TORUS: 4, COIN: 5, GEM: 6 });
  const INST_F = 20, INST_MAX = 640, PLAT_F = 8, PLAT_MAX = 160;

  S.QUALITY = {
    low: { dpr: 1, msaa: 0, distort: 0, part: 0.45, shadow: false },
    medium: { dpr: 1.5, msaa: 4, distort: 1, part: 0.75, shadow: true },
    high: { dpr: 2, msaa: 4, distort: 1, part: 1, shadow: true },
  };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.level = 'medium';
      this.scale = 1;
      this.w = this.h = 0;
      this.lost = false;
      this.q = S.QUALITY.medium;
      this.calls = 0;
      this.ok = this._init();
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
      canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this._init(); this.w = 0; this.resize(); });
    }

    _init() {
      const gl = (this.gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' }));
      if (!gl) return false;
      this.P = {
        rigid: this._prog(RIGID_VS, RIGID_FS), plat: this._prog(PLAT_VS, PLAT_FS), shadow: this._prog(SHADOW_VS, SHADOW_FS),
        col: this._prog(COL_VS, COL_FS), sky: this._prog(SKY_VS, SKY_FS), lava: this._prog(LAVA_VS, LAVA_FS),
        part: this._prog(PART_VS, PART_FS), post: this._prog(POST_VS, POST_FS),
      };
      const meshes = [
        sphere(14, 20), rbox(0.32),
        lathe([[0, -0.5], [1, -0.5], [1, 0.5], [0, 0.5]], 18),
        lathe([[0, 0], [1, 0], [0, 1]], 14),
        torus(40, 8, 0.07),
        lathe([[0, -0.1], [0.72, -0.1], [0.82, -0.17], [1, -0.1], [1, 0.1], [0.82, 0.17], [0.72, 0.1], [0, 0.1]], 22, false, true),
        lathe([[0, -1], [0.72, -0.15], [0.72, 0.15], [0, 1]], 6, true),
      ];
      this.buckets = meshes.map((m) => this._bucket(this._mesh(m)));
      this.slab = this._mesh(slab());
      this.strip = this._mesh(strip(8));
      this.quad = this._mesh({ v: [0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1], i: [0, 1, 2, 1, 3, 2] });
      this.colMesh = this._mesh(lathe([[1, -1], [1, 1]], 36));
      this.lavaMesh = this._mesh(grid(46));

      this.platData = new Float32Array(PLAT_F * PLAT_MAX);
      this.platN = 0;
      this.platBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.platBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.platData.byteLength, gl.DYNAMIC_DRAW);
      this.platVao = this._instVao(this.slab, this.platBuf, [[3, 4, 32, 0], [4, 4, 32, 16]]);
      this.shadowVao = this._instVao(this.strip, this.platBuf, [[3, 4, 32, 0], [4, 4, 32, 16]]);

      this.partBuf = gl.createBuffer();
      this.partVao = this._instVao(this.quad, this.partBuf, [[3, 4, 32, 0], [4, 4, 32, 16]]);
      this.partN = 0;
      this.partData = null;

      this.emptyVao = gl.createVertexArray();
      gl.bindVertexArray(this.emptyVao);
      this.colVao = this._plainVao(this.colMesh);
      this.lavaVao = this._plainVao(this.lavaMesh);
      this.fb = null;
      this.tfb = null;
      gl.bindVertexArray(null);
      gl.disable(gl.CULL_FACE);
      gl.depthFunc(gl.LEQUAL);
      return true;
    }

    _prog(vs, fs) {
      const gl = this.gl;
      const c = (t, s) => {
        const o = gl.createShader(t);
        gl.shaderSource(o, s);
        gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('shader: ' + gl.getShaderInfoLog(o));
        return o;
      };
      const p = gl.createProgram();
      gl.attachShader(p, c(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, c(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('link: ' + gl.getProgramInfoLog(p));
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const a = gl.getActiveUniform(p, i);
        u[a.name] = gl.getUniformLocation(p, a.name);
      }
      return { p, u };
    }

    _mesh(m) {
      const gl = this.gl;
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.v), gl.STATIC_DRAW);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(m.i), gl.STATIC_DRAW);
      return { vb, ib, n: m.i.length };
    }

    _bindMesh(m) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    }

    _plainVao(m) {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      this._bindMesh(m);
      gl.bindVertexArray(null);
      return vao;
    }

    _instVao(m, buf, attrs) {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      this._bindMesh(m);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      for (const [loc, size, stride, off] of attrs) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
        gl.vertexAttribDivisor(loc, 1);
      }
      gl.bindVertexArray(null);
      return vao;
    }

    _bucket(mesh) {
      const gl = this.gl;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, INST_F * 4 * INST_MAX, gl.DYNAMIC_DRAW);
      const s = INST_F * 4;
      const vao = this._instVao(mesh, buf, [[3, 4, s, 0], [4, 4, s, 16], [5, 4, s, 32], [6, 4, s, 48], [7, 4, s, 64]]);
      return { mesh, buf, vao, data: new Float32Array(INST_F * INST_MAX), n: 0 };
    }

    setQuality(level) {
      this.level = level;
      this.q = S.QUALITY[level];
      this.w = 0;
      this.resize();
    }

    setScale(s) {
      if (Math.abs(s - this.scale) < 0.001) return;
      this.scale = s;
      this.w = 0;
      this.resize();
    }

    resize() {
      const cw = Math.max(1, window.innerWidth), ch = Math.max(1, window.innerHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, this.q.dpr) * this.scale;
      const w = Math.max(2, Math.round(cw * dpr)), h = Math.max(2, Math.round(ch * dpr));
      if (w === this.w && h === this.h) return;
      this.w = w;
      this.h = h;
      this.canvas.width = w;
      this.canvas.height = h;
      this.aspect = w / h;
      this._buildTargets();
    }

    _buildTargets() {
      const gl = this.gl, w = this.w, h = this.h;
      const t = this.fb || (this.fb = {});
      if (t.tex) {
        gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.f); gl.deleteRenderbuffer(t.d);
        if (t.mf) { gl.deleteFramebuffer(t.mf); gl.deleteRenderbuffer(t.mc); gl.deleteRenderbuffer(t.md); t.mf = null; }
      }
      t.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      t.f = gl.createFramebuffer();
      t.d = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, t.d);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.d);
      const samples = Math.min(this.q.msaa, gl.getParameter(gl.MAX_SAMPLES) || 0);
      if (samples > 1) {
        t.mf = gl.createFramebuffer();
        t.mc = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, t.mc);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
        t.md = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, t.md);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.mf);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, t.mc);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.md);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // ---- per-frame submission ----
    rigid(meshId, m, r, g, b, em, gloss) {
      const k = this.buckets[meshId];
      if (k.n >= INST_MAX) return;
      const d = k.data, o = k.n++ * INST_F;
      for (let i = 0; i < 12; i++) d[o + i] = m[i];
      d[o + 12] = r; d[o + 13] = g; d[o + 14] = b; d[o + 15] = em;
      d[o + 16] = gloss; d[o + 17] = 0; d[o + 18] = 0; d[o + 19] = 0;
    }

    plat(th, hw, y, type, scale, tilt, flash, seed) {
      if (this.platN >= PLAT_MAX) return;
      const d = this.platData, o = this.platN++ * PLAT_F;
      d[o] = th; d[o + 1] = hw; d[o + 2] = y; d[o + 3] = type;
      d[o + 4] = scale; d[o + 5] = tilt; d[o + 6] = flash; d[o + 7] = seed;
    }

    setParticles(data, n) {
      this.partData = data;
      this.partN = n;
    }

    computeView(v) {
      // Column-major view-projection; the eye sits at y=0 relative to the frame origin.
      const f = [v.at[0] - v.eye[0], v.at[1] - v.eye[1], v.at[2] - v.eye[2]];
      const l = Math.hypot(f[0], f[1], f[2]);
      f[0] /= l; f[1] /= l; f[2] /= l;
      let r = [-f[2], 0, f[0]];
      const rl = Math.hypot(r[0], r[2]) || 1;
      r = [r[0] / rl, 0, r[2] / rl];
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      const n = 0.6, fr = 600;
      const a = v.aspect, t = v.tanV;
      const px = 1 / (t * a), py = 1 / t, A = -(fr + n) / (fr - n), B = (-2 * fr * n) / (fr - n);
      const tx = -(r[0] * v.eye[0] + r[1] * v.eye[1] + r[2] * v.eye[2]);
      const ty = -(u[0] * v.eye[0] + u[1] * v.eye[1] + u[2] * v.eye[2]);
      const tz = f[0] * v.eye[0] + f[1] * v.eye[1] + f[2] * v.eye[2];
      v.vp = new Float32Array([
        px * r[0], py * u[0], A * -f[0], f[0],
        px * r[1], py * u[1], A * -f[1], f[1],
        px * r[2], py * u[2], A * -f[2], f[2],
        px * tx, py * ty, A * tz + B, -tz,
      ]);
      v.r = r; v.u = u; v.f = f;
      return v;
    }

    project(v, x, y, z) {
      const m = v.vp;
      const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [(cx / cw) * 0.5 + 0.5, (cy / cw) * 0.5 + 0.5, cw];
    }

    _lit(pr, F) {
      const gl = this.gl, u = pr.u, E = F.pal;
      gl.uniformMatrix4fv(u.uVP, false, F.view.vp);
      gl.uniform3fv(u.uEye, F.view.eye);
      gl.uniform3fv(u.uSunD, F.sunD);
      gl.uniform3fv(u.uSunC, E.light);
      gl.uniform3fv(u.uHemiS, E.hemiS);
      gl.uniform3fv(u.uHemiG, E.hemiG);
      gl.uniform3fv(u.uFog, E.fog);
      gl.uniform2fv(u.uFogR, E.fogR);
      gl.uniform1f(u.uLavaY, F.lavaY);
      gl.uniform1f(u.uLavaG, F.lavaG);
    }

    _drawGeometry(F) {
      const gl = this.gl, P = this.P, E = F.pal;
      const rp = P.rigid;
      gl.useProgram(rp.p);
      this._lit(rp, F);
      for (const k of this.buckets) {
        if (!k.n) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, k.buf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, k.data, 0, k.n * INST_F);
        gl.bindVertexArray(k.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, k.mesh.n, gl.UNSIGNED_SHORT, 0, k.n);
      }
      if (this.platN) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.platBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.platData, 0, this.platN * PLAT_F);
        const pp = P.plat;
        gl.useProgram(pp.p);
        this._lit(pp, F);
        const t = F.theme;
        gl.uniform1f(pp.u.uR, C.R);
        gl.uniform3fv(pp.u.uThA, t.a);
        gl.uniform3fv(pp.u.uThB, t.b);
        gl.uniform3fv(pp.u.uThS, t.side);
        gl.uniform4fv(pp.u.uThP, t.p);
        gl.uniform1f(pp.u.uThE, t.e);
        gl.uniform1f(pp.u.uTime, F.time);
        gl.uniform4fv(pp.u.uShadow, F.shadow);
        gl.uniform3fv(pp.u.uCamDir, F.camDir);
        gl.bindVertexArray(this.platVao);
        gl.drawElementsInstanced(gl.TRIANGLES, this.slab.n, gl.UNSIGNED_SHORT, 0, this.platN);
      }
      if (F.column) {
        const cp = P.col;
        gl.useProgram(cp.p);
        this._lit(cp, F);
        gl.uniform1f(cp.u.uRc, F.column);
        gl.uniform1f(cp.u.uYOff, F.oy);
        gl.uniform3fv(cp.u.uColA, E.colA);
        gl.uniform3fv(cp.u.uColB, E.colB);
        gl.bindVertexArray(this.colVao);
        gl.drawElements(gl.TRIANGLES, this.colMesh.n, gl.UNSIGNED_SHORT, 0);
        if (this.q.shadow && this.platN) {
          const sp = P.shadow;
          gl.useProgram(sp.p);
          gl.uniformMatrix4fv(sp.u.uVP, false, F.view.vp);
          gl.uniform1f(sp.u.uR, C.R);
          gl.uniform1f(sp.u.uRc, F.column);
          gl.uniform1f(sp.u.uA, 0.34);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.depthMask(false);
          gl.bindVertexArray(this.shadowVao);
          gl.drawElementsInstanced(gl.TRIANGLES, this.strip.n, gl.UNSIGNED_SHORT, 0, this.platN);
          gl.depthMask(true);
          gl.disable(gl.BLEND);
        }
      }
    }

    _clearSubmits() {
      for (const k of this.buckets) k.n = 0;
      this.platN = 0;
      this.partN = 0;
    }

    render(F) {
      if (this.lost) { this._clearSubmits(); return; }
      const gl = this.gl, P = this.P, E = F.pal, t = this.fb, v = F.view;
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.mf || t.f);
      gl.viewport(0, 0, this.w, this.h);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      const sk = P.sky;
      gl.useProgram(sk.p);
      const tanH = v.tanV * v.aspect;
      gl.uniform3f(sk.u.uRight, v.r[0] * tanH, v.r[1] * tanH, v.r[2] * tanH);
      gl.uniform3f(sk.u.uUp, v.u[0] * v.tanV, v.u[1] * v.tanV, v.u[2] * v.tanV);
      gl.uniform3fv(sk.u.uFwd, v.f);
      gl.uniform3fv(sk.u.uTop, E.top);
      gl.uniform3fv(sk.u.uMid, E.mid);
      gl.uniform3fv(sk.u.uHor, E.hor);
      gl.uniform3fv(sk.u.uSunV, F.skySun);
      gl.uniform3fv(sk.u.uSunCol, E.sun);
      gl.uniform1f(sk.u.uStars, E.stars);
      gl.uniform1f(sk.u.uTime, F.time);
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      this._drawGeometry(F);

      if (F.lavaVisible) {
        const lp = P.lava;
        gl.useProgram(lp.p);
        gl.uniformMatrix4fv(lp.u.uVP, false, v.vp);
        gl.uniform1f(lp.u.uLavaY, F.lavaY);
        gl.uniform1f(lp.u.uTime, F.time);
        gl.uniform3fv(lp.u.uEye, v.eye);
        gl.uniform3fv(lp.u.uFog, E.fog);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(this.lavaVao);
        gl.drawElements(gl.TRIANGLES, this.lavaMesh.n, gl.UNSIGNED_SHORT, 0);
        gl.disable(gl.BLEND);
      }

      if (this.partN) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this.partData, gl.DYNAMIC_DRAW, 0, this.partN * 8);
        const pr = P.part;
        gl.useProgram(pr.p);
        gl.uniformMatrix4fv(pr.u.uVP, false, v.vp);
        gl.uniform3fv(pr.u.uRight, v.r);
        gl.uniform3fv(pr.u.uUp, v.u);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.bindVertexArray(this.partVao);
        gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.partN);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }

      if (t.mf) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.mf);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.f);
        gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.w, this.h);
      gl.disable(gl.DEPTH_TEST);
      const po = P.post;
      gl.useProgram(po.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.uniform1i(po.u.uT, 0);
      gl.uniform1f(po.u.uTime, F.time);
      gl.uniform1f(po.u.uHeat, F.heat);
      gl.uniform1f(po.u.uDist, this.q.distort);
      gl.uniform1f(po.u.uLavaS, F.lavaS);
      gl.uniform1f(po.u.uWarn, F.warn);
      gl.uniform1f(po.u.uFlash, F.flash);
      gl.uniform3fv(po.u.uFlashC, F.flashC);
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      this._clearSubmits();
    }

    // Render the currently submitted geometry into a small image for menus.
    thumbnail(F, size) {
      const gl = this.gl;
      if (!this.tfb) {
        const t = (this.tfb = { size });
        t.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, size, size);
        t.f = gl.createFramebuffer();
        t.d = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, t.d);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, size, size);
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.d);
        this.tCanvas = document.createElement('canvas');
        this.tCanvas.width = this.tCanvas.height = size;
        this.tPixels = new Uint8Array(size * size * 4);
      }
      const sz = this.tfb.size;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.tfb.f);
      gl.viewport(0, 0, sz, sz);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      this._drawGeometry(F);
      gl.readPixels(0, 0, sz, sz, gl.RGBA, gl.UNSIGNED_BYTE, this.tPixels);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindVertexArray(null);
      this._clearSubmits();
      const ctx = this.tCanvas.getContext('2d');
      const img = ctx.createImageData(sz, sz);
      for (let y = 0; y < sz; y++) {
        const src = (sz - 1 - y) * sz * 4, dst = y * sz * 4;
        img.data.set(this.tPixels.subarray(src, src + sz * 4), dst);
      }
      ctx.putImageData(img, 0, 0);
      return this.tCanvas.toDataURL('image/png');
    }
  }
  S.Renderer = Renderer;
})();
