"""Deterministic waist/neck/arm skinning of ONE neutral material, no optical flow.

python scripts/build-butler-rig.py --guide work/motion-art
python scripts/build-butler-rig.py SOURCE.png --review work/motion-art --vendor PATH
The runtime atlas, pose audit and previews all use pose(). 24 descend poses are
reused in reverse for rising; trousers, knees and boots never move.
"""
import argparse, json, math, pathlib, hashlib, sys, re
from PIL import Image, ImageDraw
ROOT=pathlib.Path(__file__).resolve().parents[1]
W,H=400,560
HIP=(130,235)
# Bound against butler-bind-grid.png, after the single source normalisation.
# The previous draft's 320px hip was the upper thigh: it must NOT drive this art.
BIND={'hip':HIP,'head':(128,50),'neck':(132,88),'shoulder':(122,112),
 'near_shoulder':(85,123),'near_elbow':(78,182),'near_wrist':(136,145),
 'far_shoulder':(173,124),'far_elbow':(181,193),'far_wrist':(160,207),
 'near_hip':(115,235),'near_knee':(115,390),'near_ankle':(115,512),'near_toe':(141,528),
 'far_hip':(145,235),'far_knee':(145,390),'far_ankle':(145,512),'far_toe':(165,528)}
def rotate(p,root,degrees):
 a=math.radians(degrees);x,y=p[0]-root[0],p[1]-root[1]
 return (root[0]+x*math.cos(a)-y*math.sin(a),root[1]+x*math.sin(a)+y*math.cos(a))
def smooth(v):
 v=max(0,min(1,v));return v*v*(3-2*v)
def pose(i):
 p=i/23;angle=55*smooth(p);j={}
 for name,xy in BIND.items():
  if 'knee' in name or 'ankle' in name or 'toe' in name or 'hip' in name:j[name]=xy
  else:j[name]=rotate(xy,HIP,angle)
 j['head']=rotate(j['head'],j['neck'],8*smooth(p))
 # The gloved hand settles against the chest, with a separate elbow rotation.
 j['near_wrist']=rotate(j['near_wrist'],j['near_elbow'],4*math.sin(math.pi*p))
 return {'angle':angle,'joints':j,'neckAngle':8*smooth(p),'armAngle':4*math.sin(math.pi*p)}
def spec():
 bones=[('torso',['hip','shoulder','neck','head'],'#e4c26b'),
 ('near_arm',['near_shoulder','near_elbow','near_wrist'],'#ff38bf'),
 ('far_arm',['far_shoulder','far_elbow','far_wrist'],'#27d6e6'),
 ('near_leg',['near_hip','near_knee','near_ankle','near_toe'],'#ff38bf'),
 ('far_leg',['far_hip','far_knee','far_ankle','far_toe'],'#27d6e6')]
 return {'cell':560,'columns':8,'rows':6,'groundY':532,'lineWidth':5,'jointRadius':4,
  'bones':[{'name':n,'joints':j,'color':c} for n,j,c in bones],
  'frames':[{'groundY':532,'joints':pose(i)['joints']} for i in list(range(24))+list(reversed(range(24)))],
  'audit':{'boneLengthTolerance':.02,'maxJointStep':28},
  'contract':{'canvas':[W,H],'runtimeCell':[320,448],'frames':24,'columns':6,'rows':4,'pivot':HIP,
    'fixed':['hip','near_hip','far_hip','near_knee','far_knee','near_ankle','far_ankle','near_toe','far_toe'],
    'method':'Single neutral material; waist/neck/arm skinning; fixed lower limbs; same pose data for atlas and audit'}}
def skin(point,p):
 x,y=point;angle=p['angle'];weight=1-smooth((y-220)/15)
 # Waist is a smooth deformation zone, rather than a horizontal cut/pasted top.
 q=rotate(point,HIP,angle*weight)
 # Small head nod and forearm settle use their own fixed-length joint pivots.
 head=1-smooth((y-79)/22)
 q=rotate(q,p['joints']['neck'],p['neckAngle']*head)
 if 80<x<165 and 133<y<192:
  arm=smooth((x-80)/20)*(1-smooth((x-153)/12))*smooth((y-133)/10)*(1-smooth((y-177)/15))
  q=rotate(q,p['joints']['near_elbow'],p['armAngle']*arm)
 # Tail at the back follows the waist, independent of the stationary trousers.
 if x<96 and 235<y<402:
  tail=math.sin(math.pi*(y-235)/167)*smooth((96-x)/24)
  q=(q[0]-math.sin(math.radians(angle))*8*tail,q[1]-6*tail*angle/55)
 return q
def main():
 ap=argparse.ArgumentParser();ap.add_argument('source',nargs='?');ap.add_argument('--guide');ap.add_argument('--review',default='work/motion-art');ap.add_argument('--vendor');args=ap.parse_args()
 review=pathlib.Path(args.guide or args.review);review.mkdir(parents=True,exist_ok=True)
 audit=spec();(review/'butler-pose.json').write_text(json.dumps(audit,indent=2),encoding='utf8')
 if args.guide:return
 if args.vendor:sys.path.insert(0,args.vendor)
 import numpy as np
 import cv2
 source=Image.open(args.source).convert('RGBA')
 # Normalise only once. Source has a deliberately upright, narrow stance.
 bbox=source.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox()
 crop=source.crop(bbox);crop.thumbnail((210,520),Image.Resampling.LANCZOS)
 neutral=Image.new('RGBA',(W,H));neutral.alpha_composite(crop,(round(125-crop.width/2),535-crop.height))
 neutral.save(review/'butler-neutral.png')
 rgba=np.asarray(neutral).astype('float32')/255;rgba[:,:,:3]*=rgba[:,:,3:4]
 xs=sorted(set(list(range(0,W+1,20))+[78,85,96,115,130,136,145,165,173,181]));ys=sorted(set(list(range(0,H+1,20))+[50,79,88,101,112,123,133,145,177,182,193,207,217,230,235,245,255,390,512,528]))
 frames=[];bounds=[]
 for i in range(24):
  p=pose(i);out=np.zeros((H,W,4),np.float32)
  for joint,point in BIND.items():
   assert math.dist(skin(point,p),p['joints'][joint])<.5,('material/pose mismatch',i,joint)
  for y0,y1 in zip(ys,ys[1:]):
   for x0,x1 in zip(xs,xs[1:]):
    for tri in [[(x0,y0),(x1,y0),(x0,y1)],[(x1,y0),(x1,y1),(x0,y1)]]:
     a=np.float32(tri);b=np.float32([skin(pt,p) for pt in tri]);rx,ry,rw,rh=cv2.boundingRect(b)
     if rw<1 or rh<1 or rx>=W or ry>=H or rx+rw<=0 or ry+rh<=0:continue
     left,top=max(0,rx),max(0,ry);right,bottom=min(W,rx+rw),min(H,ry+rh)
     mat=cv2.getAffineTransform(a,b);mat[:,2]-=(left,top)
     warped=cv2.warpAffine(rgba,mat,(right-left,bottom-top),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
     mask=np.zeros((bottom-top,right-left),np.uint8);cv2.fillConvexPoly(mask,np.rint(b-(left,top)).astype('int32'),255)
     dst=out[top:bottom,left:right];take=(mask>0)&(warped[:,:,3]>dst[:,:,3]);dst[take]=warped[take]
  alpha=out[:,:,3:4];out[:,:,:3]=np.divide(out[:,:,:3],alpha,out=np.zeros_like(out[:,:,:3]),where=alpha>.001)
  im=Image.fromarray(np.uint8(np.clip(out*255,0,255)))
  b=im.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox();bounds.append(b)
  assert b and b[0]>=6 and b[1]>=6 and b[2]<=W-6 and b[3]<=H-6,('clipped pose',i,b)
  frames.append(im.resize((320,448),Image.Resampling.LANCZOS))
 outdir=ROOT/'apps/web/public/art/effects/v4';outdir.mkdir(parents=True,exist_ok=True)
 atlas=Image.new('RGBA',(1920,1792))
 for i,im in enumerate(frames):atlas.alpha_composite(im,(i%6*320,i//6*448))
 atlas.save(outdir/'butler-bow.webp',quality=94,method=6)
 # Sample the runtime's shared clock, rather than playing each atlas cell for
 # the same GIF duration (which incorrectly lengthens the bow/rise).
 timing_source=(ROOT/'apps/web/src/components/cinematic-timing.ts').read_text(encoding='utf8')
 timing={k:int(v) for k,v in re.findall(r'(\w+):\s*(\d+)',re.search(r'butler:\s*\{([^}]+)',timing_source).group(1))}
 def runtime_frame(t):
  if t<timing['ready']:return 0
  if t<timing['bow']:return math.floor(max(0,min(1,(t-timing['ready'])/(timing['bow']-timing['ready'])))*23+.5)
  if t<timing['rise']:return 23
  return math.floor((1-max(0,min(1,(t-timing['rise'])/(timing['upright']-timing['rise']))))*23+.5)
 order=[runtime_frame(t) for t in range(0,timing['end']+1,40)]
 previews=[];checks=[]
 for i in order:
  bg=Image.new('RGBA',(320,448),'#111510');bg.alpha_composite(frames[i]);previews.append(bg.convert('RGB'))
  d=ImageDraw.Draw(bg)
  for bone in audit['bones']:
   pts=[tuple(v*.8 for v in pose(i)['joints'][key]) for key in bone['joints']];d.line(pts,fill=bone['color'],width=2)
  checks.append(bg.convert('RGB'))
 for name,ims in [('butler-motion',previews),('butler-audit',checks)]:ims[0].save(review/(name+'.gif'),save_all=True,append_images=ims[1:],duration=40,loop=0)
 contact=Image.new('RGBA',(1600,448),'#111510')
 for n,i in enumerate([0,6,12,18,23]):contact.alpha_composite(frames[i],(n*320,0))
 contact.save(review/'butler-keyframes.png')
 audit.update(sourceSha256=hashlib.sha256(pathlib.Path(args.source).read_bytes()).hexdigest(),sourceBounds=bbox,poseBounds=bounds,sourceScale=crop.size)
 (outdir/'butler-motion.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
 print(json.dumps({'frames':24,'atlas':[1920,1792],'decodedBytes':1920*1792*4,'bounds':bounds}))
if __name__=='__main__':main()
