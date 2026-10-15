// Original CC0 test MIDlet, assembled as Java 45.3 class files without a JDK.
// Equivalent Java source is in SmokeMidlet.java. No commercial game is included.
const u2 = n => [n >>> 8 & 255, n & 255]
const u4 = n => [n >>> 24 & 255, n >>> 16 & 255, ...u2(n)]
function javaClass(name, parent, define) {
  const pool = [], cache = new Map()
  const add = (key, bytes) => { if (cache.has(key)) return cache.get(key); pool.push(bytes); cache.set(key, pool.length); return pool.length }
  const utf = text => { const b = [...Buffer.from(text)]; return add('u'+text, [1, ...u2(b.length), ...b]) }
  const cls = n => { const i = utf(n); return add('c'+n, [7, ...u2(i)]) }
  const ref = (tag, c, n, d) => { const ci=cls(c), ni=utf(n), di=utf(d), nt=add('n'+n+d,[12,...u2(ni),...u2(di)]); return add(tag+c+n+d,[tag,...u2(ci),...u2(nt)]) }
  const self = cls(name), sup = cls(parent), codeIndex = utf('Code'), methods = [], fields = [], interfaces = []
  const api = { call: (c,n,d) => u2(ref(10,c,n,d)), field: (c,n,d) => u2(ref(9,c,n,d)), cls: n => u2(cls(n)),
    implements(n) { interfaces.push(u2(cls(n))) },
    fieldDef(n,d) { fields.push([0,1,...u2(utf(n)),...u2(utf(d)),0,0]) },
    method(n,d,code,stack=4,locals=2) { const ni=utf(n),di=utf(d); const body=[...u2(stack),...u2(locals),...u4(code.length),...code,0,0,0,0]; methods.push([0,1,...u2(ni),...u2(di),0,1,...u2(codeIndex),...u4(body.length),...body]) },
  }
  define(api)
  return Buffer.from([0xca,0xfe,0xba,0xbe,0,3,0,45,...u2(pool.length+1),...pool.flat(),0,0x21,...u2(self),...u2(sup),...u2(interfaces.length),...interfaces.flat(),...u2(fields.length),...fields.flat(),...u2(methods.length),...methods.flat(),0,0])
}
function crc32(bytes) { let crc=0xffffffff; for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=crc>>>1^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0 }
function zip(files) {
  const parts=[], central=[]; let offset=0
  const le2=n=>[n&255,n>>>8&255], le4=n=>[...le2(n),...le2(n>>>16)]
  for(const [name,content] of Object.entries(files)) {
    const n=Buffer.from(name), b=Buffer.from(content), crc=crc32(b)
    const h=Buffer.from([80,75,3,4,20,0,0,0,0,0,0,0,0,0,...le4(crc),...le4(b.length),...le4(b.length),...le2(n.length),0,0,...n])
    central.push(Buffer.from([80,75,1,2,20,0,20,0,0,0,0,0,0,0,0,0,...le4(crc),...le4(b.length),...le4(b.length),...le2(n.length),0,0,0,0,0,0,0,0,0,0,0,0,...le4(offset),...n]))
    parts.push(h,b);offset+=h.length+b.length
  }
  const c=Buffer.concat(central), count=central.length
  return Buffer.concat([...parts,c,Buffer.from([80,75,5,6,0,0,0,0,...le2(count),...le2(count),...le4(c.length),...le4(offset),0,0])])
}
export function smokeJar({ missingMain = false, animated = false, serviceRepaints = false } = {}) {
  const main=javaClass('SmokeMidlet','javax/microedition/midlet/MIDlet',p=>{
    p.method('<init>','()V',[42,183,...p.call('javax/microedition/midlet/MIDlet','<init>','()V'),177])
    p.method('startApp','()V',[42,184,...p.call('javax/microedition/lcdui/Display','getDisplay','(Ljavax/microedition/midlet/MIDlet;)Ljavax/microedition/lcdui/Display;'),187,...p.cls('SmokeCanvas'),89,183,...p.call('SmokeCanvas','<init>','()V'),182,...p.call('javax/microedition/lcdui/Display','setCurrent','(Ljavax/microedition/lcdui/Displayable;)V'),177])
    p.method('pauseApp','()V',[177]);p.method('destroyApp','(Z)V',[177])
  })
  const canvas=javaClass('SmokeCanvas','javax/microedition/lcdui/Canvas',p=>{
    p.fieldDef('color','I')
    if (serviceRepaints) {
      p.fieldDef('painted','I');p.implements('java/lang/Runnable')
      p.method('<init>','()V',[42,183,...p.call('javax/microedition/lcdui/Canvas','<init>','()V'),177])
      p.method('showNotify','()V',[187,...p.cls('java/lang/Thread'),89,42,183,...p.call('java/lang/Thread','<init>','(Ljava/lang/Runnable;)V'),182,...p.call('java/lang/Thread','start','()V'),177])
      // while (painted == 0) { repaint(); serviceRepaints(); } color=255; repaint(); serviceRepaints();
      p.method('run','()V',[42,180,...p.field('SmokeCanvas','painted','I'),154,0,14,42,182,...p.call('javax/microedition/lcdui/Canvas','repaint','()V'),42,182,...p.call('javax/microedition/lcdui/Canvas','serviceRepaints','()V'),167,255,241,42,17,0,255,181,...p.field('SmokeCanvas','color','I'),42,182,...p.call('javax/microedition/lcdui/Canvas','repaint','()V'),42,182,...p.call('javax/microedition/lcdui/Canvas','serviceRepaints','()V'),177])
    } else if (animated) {
      p.implements('java/lang/Runnable')
      p.method('<init>','()V',[42,183,...p.call('javax/microedition/lcdui/Canvas','<init>','()V'),187,...p.cls('java/lang/Thread'),89,42,183,...p.call('java/lang/Thread','<init>','(Ljava/lang/Runnable;)V'),182,...p.call('java/lang/Thread','start','()V'),177])
      p.method('run','()V',[42,89,180,...p.field('SmokeCanvas','color','I'),4,96,181,...p.field('SmokeCanvas','color','I'),42,182,...p.call('javax/microedition/lcdui/Canvas','repaint','()V'),16,100,133,184,...p.call('java/lang/Thread','sleep','(J)V'),167,255,236])
    } else p.method('<init>','()V',[42,183,...p.call('javax/microedition/lcdui/Canvas','<init>','()V'),42,17,0,255,181,...p.field('SmokeCanvas','color','I'),177])
    const paintStart=serviceRepaints?[16,20,133,184,...p.call('java/lang/Thread','sleep','(J)V')]:[]
    const paintEnd=serviceRepaints?[42,4,181,...p.field('SmokeCanvas','painted','I')]:[]
    p.method('paint','(Ljavax/microedition/lcdui/Graphics;)V',[...paintStart,43,42,180,...p.field('SmokeCanvas','color','I'),182,...p.call('javax/microedition/lcdui/Graphics','setColor','(I)V'),43,3,3,17,0,240,17,1,64,182,...p.call('javax/microedition/lcdui/Graphics','fillRect','(IIII)V'),...paintEnd,177],5)
    p.method('keyPressed','(I)V',[42,17,0,255,16,8,120,181,...p.field('SmokeCanvas','color','I'),42,182,...p.call('javax/microedition/lcdui/Canvas','repaint','()V'),177])
    p.method('keyReleased','(I)V',[42,17,0,255,16,16,120,181,...p.field('SmokeCanvas','color','I'),42,182,...p.call('javax/microedition/lcdui/Canvas','repaint','()V'),177])
  })
  return zip({'META-INF/MANIFEST.MF':'Manifest-Version: 1.0\r\nMIDlet-Name: Smoke\r\nMIDlet-Vendor: ProjectTests\r\nMIDlet-Version: 1.0\r\nMIDlet-1: Smoke, , '+(missingMain?'MissingMain':'SmokeMidlet')+'\r\nMicroEdition-Profile: MIDP-2.0\r\nMicroEdition-Configuration: CLDC-1.0\r\n','SmokeMidlet.class':main,'SmokeCanvas.class':canvas})
}
