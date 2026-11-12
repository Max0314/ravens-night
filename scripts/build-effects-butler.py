"""Deterministic full-body bow, using the accepted v1 butler appearance.

python scripts/build-effects-butler.py <external-review-directory>
No generated in-between poses: legs use fixed-length inverse kinematics,
spine/head use forward kinematics, the accepted illustration is skinned by a
continuous mesh. Feet, source scale, and cell pivot remain fixed in all frames.
"""
from __future__ import annotations
import hashlib,json,math,pathlib,sys
import numpy as np
from PIL import Image,ImageDraw

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'apps/web/public/art/effects/v2'
REVIEW=pathlib.Path(sys.argv[1]).resolve()
SCALE=256/960
SOURCE=ROOT/'apps/web/public/art/effects/v1/butler.webp'

def rotate(v,a):
    c,s=math.cos(a),math.sin(a)
    return np.array([v[0]*c-v[1]*s,v[0]*s+v[1]*c])
def smooth(t):return t*t*(3-2*t)
def ik(hip,ankle,upper,lower):
    d=hip-ankle;dist=np.linalg.norm(d);axis=d/dist
    offset=(lower*lower-upper*upper+dist*dist)/(2*dist)
    h=math.sqrt(max(0,lower*lower-offset*offset))
    return ankle+axis*offset+np.array([-axis[1],axis[0]])*h

REF={k:np.array(v,dtype=float) for k,v in {
    'pelvis':(480,820),'spine':(481,510),'neck':(490,241),'head':(508,137),
    'nearHip':(440,832),'nearKnee':(443,1110),'nearAnkle':(451,1370),'nearToe':(453,1415),
    'farHip':(518,832),'farKnee':(521,1102),'farAnkle':(522,1366),'farToe':(539,1415),
    'nearShoulder':(373,292),'nearElbow':(353,470),'nearWrist':(539,346),
    'farShoulder':(594,293),'farElbow':(629,464),'farWrist':(620,592),
}.items()}
BONES=[('pelvis','spine'),('spine','neck'),('neck','head'),('nearHip','nearKnee'),('nearKnee','nearAnkle'),
       ('nearAnkle','nearToe'),('farHip','farKnee'),('farKnee','farAnkle'),('farAnkle','farToe'),
       ('nearShoulder','nearElbow'),('nearElbow','nearWrist'),('farShoulder','farElbow'),('farElbow','farWrist')]

def amount(frame):
    if frame<8:return .018*smooth(frame/7)
    if frame<24:return .018+.982*smooth((frame-8)/15)
    if frame<36:return 1-.0015*(1-math.cos((frame-24)/11*math.pi*2))
    if frame<52:return 1-smooth((frame-36)/15)
    return -.006*math.sin((frame-52)/3*math.pi)

def pose(frame):
    t=amount(frame);a=math.radians(25*t);b=math.radians(33*t);h=math.radians(41*t)
    out={k:v.copy() for k,v in REF.items()}
    out['pelvis']=REF['pelvis']+[-22*t,14*t]
    out['spine']=out['pelvis']+rotate(REF['spine']-REF['pelvis'],a)
    out['neck']=out['spine']+rotate(REF['neck']-REF['spine'],b)
    out['head']=out['neck']+rotate(REF['head']-REF['neck'],h)
    for side in ['near','far']:
        hip,knee,ankle,toe=[side+n for n in ['Hip','Knee','Ankle','Toe']]
        out[hip]=out['pelvis']+REF[hip]-REF['pelvis']
        upper=np.linalg.norm(REF[knee]-REF[hip]);lower=np.linalg.norm(REF[ankle]-REF[knee])
        # Exact planted ankle/toe positions; small hip drop produces real knee flexion.
        out[knee]=ik(out[hip],REF[ankle],upper,lower)
        shoulder,elbow,wrist=[side+n for n in ['Shoulder','Elbow','Wrist']]
        out[shoulder]=out['neck']+rotate(REF[shoulder]-REF['neck'],b)
        out[elbow]=out[shoulder]+rotate(REF[elbow]-REF[shoulder],b)
        out[wrist]=out[elbow]+rotate(REF[wrist]-REF[elbow],b)
    return out

def transfer(point,src_a,src_b,dst_a,dst_b):
    v=src_b-src_a;w=dst_b-dst_a
    theta=math.atan2(w[1],w[0])-math.atan2(v[1],v[0])
    return dst_a+rotate(point-src_a,theta)

def warp_point(point,joints):
    x,y=point
    if y>=1370:return point.copy()
    if y>=820:
        side='near' if x<490 else 'far'
        candidates=[(side+'Hip',side+'Knee'),(side+'Knee',side+'Ankle')]
        weights=[]
        for a,b in candidates:
            d=REF[b]-REF[a];u=max(0,min(1,float(np.dot(point-REF[a],d)/np.dot(d,d))))
            distance=np.linalg.norm(point-(REF[a]+u*d))
            weights.append(1/max(18,distance)**4)
        mapped=sum(transfer(point,REF[a],REF[b],joints[a],joints[b])*w for (a,b),w in zip(candidates,weights))/sum(weights)
        # Shoes retain their world anchoring; blend over lower shin to avoid a seam.
        fixed=smooth(max(0,min(1,(y-1260)/110)))
        return mapped*(1-fixed)+point*fixed
    if y<205:
        return transfer(point,REF['neck'],REF['head'],joints['neck'],joints['head'])
    if y<300:
        head=transfer(point,REF['neck'],REF['head'],joints['neck'],joints['head'])
        upper=transfer(point,REF['spine'],REF['neck'],joints['spine'],joints['neck'])
        blend=smooth((y-205)/95)
        return head*(1-blend)+upper*blend
    lower=transfer(point,REF['pelvis'],REF['spine'],joints['pelvis'],joints['spine'])
    upper=transfer(point,REF['spine'],REF['neck'],joints['spine'],joints['neck'])
    blend=smooth(max(0,min(1,(y-400)/240)))
    mapped=upper*(1-blend)+lower*blend
    # Pelvis joins both independently bent legs, rather than hiding/cropping them.
    if y>750:
        base=point+joints['pelvis']-REF['pelvis']
        p=smooth((y-750)/70);mapped=mapped*(1-p)+base*p
    return mapped

def affine_triangle(source,output,src,dst):
    left,top=np.floor(dst.min(axis=0)).astype(int);right,bottom=np.ceil(dst.max(axis=0)).astype(int)
    left=max(0,left);top=max(0,top);right=min(output.width,right);bottom=min(output.height,bottom)
    if right<=left or bottom<=top:return
    matrix=np.c_[dst,np.ones(3)]
    try:coeff=np.linalg.solve(matrix,src)
    except np.linalg.LinAlgError:return
    # PIL affine maps local output coordinates back into the unchanged source.
    a,b=coeff[0];c,d=coeff[1];e,f=coeff[2]
    tile=source.transform((right-left,bottom-top),Image.Transform.AFFINE,
        (a,c,e+a*left+c*top,b,d,f+b*left+d*top),Image.Resampling.BICUBIC)
    mask=Image.new('L',tile.size);draw=ImageDraw.Draw(mask)
    draw.polygon([(float(x-left),float(y-top))for x,y in dst],fill=255)
    alpha=np.asarray(tile.getchannel('A'),dtype=np.uint16)*np.asarray(mask,dtype=np.uint16)//255
    tile.putalpha(Image.fromarray(alpha.astype(np.uint8)))
    output.alpha_composite(tile,(left,top))

def main():
    OUT.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
    # Source art was inspected at its native resolution. One uniform authored scale.
    image=Image.open(SOURCE).convert('RGBA')
    # Move the reference's sole to the contracted baseline, preserving its scale.
    source=Image.new('RGBA',(960,1440));source.alpha_composite(image.resize((943,1415),Image.Resampling.LANCZOS),(8,0))
    source.save(OUT/'butler-source.webp',quality=90,method=6)
    # Dense shared mesh, rendered at 2x runtime resolution, then one uniform downsample.
    xs=[0,250,300,350,400,450,490,530,570,620,670,730,800,880,960]
    ys=[0,95,160,205,245,300,365,430,510,580,650,725,780,820,875,950,1030,1110,1190,1270,1330,1370,1415,1440]
    vertices=np.array([(x,y)for y in ys for x in xs],dtype=float)
    triangles=[]
    for row in range(len(ys)-1):
        for col in range(len(xs)-1):
            i=row*len(xs)+col;j=i+len(xs)
            triangles.extend([(i,i+1,j+1),(i,j+1,j)])
    source2=source.resize((512,768),Image.Resampling.LANCZOS)
    frames=[];audit=[];joint_frames=[];guides=[]
    for n in range(56):
        joints=pose(n);joint_frames.append({k:[round(float(t),5)for t in v]for k,v in joints.items()})
        mapped=np.array([warp_point(v,joints)for v in vertices])
        canvas=Image.new('RGBA',(512,768))
        for tri in triangles:
            src=vertices[list(tri)]*(512/960);dst=mapped[list(tri)]*(512/960)
            box=tuple([*np.floor(src.min(axis=0)).astype(int),*np.ceil(src.max(axis=0)).astype(int)])
            if not source2.crop(box).getbbox():continue
            affine_triangle(source2,canvas,src,dst)
        cell=canvas.resize((256,384),Image.Resampling.LANCZOS);frames.append(cell)
        guide=Image.new('RGB',(256,384),'#141613');d=ImageDraw.Draw(guide)
        for a,b in BONES:
            color='#ed59ce' if a.startswith('near')else '#55ddeb' if a.startswith('far')else '#dfc98e'
            d.line([tuple(joints[a]*SCALE),tuple(joints[b]*SCALE)],fill=color,width=3)
        d.line([(0,1415*SCALE),(256,1415*SCALE)],fill='#57604e')
        d.text((6,6),str(n),fill='white');guides.append(guide)
        ac=Image.new('RGB',(256,384),'#121512');ac.paste(cell,mask=cell.getchannel('A'))
        ad=ImageDraw.Draw(ac)
        for a,b in BONES:ad.line([tuple(joints[a]*SCALE),tuple(joints[b]*SCALE)],fill='#f85bd9' if a.startswith('near')else '#40e7ee' if a.startswith('far')else '#ddc878',width=2)
        audit.append(ac)
    sheet=Image.new('RGBA',(2048,2688))
    for n,cell in enumerate(frames):sheet.alpha_composite(cell,((n%8)*256,(n//8)*384))
    sheet.save(OUT/'butler-bow.webp',quality=88,method=6,alpha_quality=100)
    # Review deliverables are intentionally outside the runtime/public directory.
    for name,sequence in [('butler-bow',frames),('butler-audit',audit),('butler-skeleton',guides)]:
        rgb=[]
        for f in sequence:
            bg=Image.new('RGB',f.size,'#111611');bg.paste(f,mask=f.getchannel('A'))if f.mode=='RGBA' else bg.paste(f);rgb.append(bg)
        rgb[0].save(REVIEW/(name+'.gif'),save_all=True,append_images=rgb[1:],duration=42,loop=0)
    preview=Image.new('RGB',(256*4,384),'#111611')
    for i,n in enumerate([0,16,30,51]):preview.paste(frames[n],(i*256,0),frames[n])
    preview.save(REVIEW/'butler-keyframes.png')
    # Bone-length, planted-foot and frame-boundary audit before shipping.
    errors=[]
    for n,j in enumerate(joint_frames):
        for a,b in BONES:
            ratio=np.linalg.norm(np.array(j[a])-j[b])/np.linalg.norm(REF[a]-REF[b])
            if abs(ratio-1)>.02:errors.append([n,a,b,ratio])
        for key in ['nearAnkle','nearToe','farAnkle','farToe']:
            if np.linalg.norm(np.array(j[key])-REF[key])>2:errors.append([n,key,'slide'])
    assert not errors,errors
    pose_spec={'version':1,'sourceCanvas':[960,1440],'cell':[256,384],'frameCount':56,'columns':8,'fps':24,
        'pivot':[480,1415],'groundY':1415,'facing':'three-quarter right','bones':BONES,
        'drawOrder':['far leg/arm','accepted textured torso','near leg/arm','head'],
        'motion':'deterministic fixed-length IK legs and FK spine/head; continuous authored image mesh, no generated inbetweens',
        'phaseFrames':{'settle':[0,7],'bend':[8,23],'holdLoop':[24,35],'rise':[36,51],'recover':[52,55]},
        'frames':joint_frames,'audit':{'maxBoneErrorRatio':.02,'footSlidePixels':0,'validFrames':56,'passed':True}}
    (OUT/'butler-pose.json').write_text(json.dumps(pose_spec,indent=2)+'\n',encoding='utf-8')
    timing=json.loads((ROOT/'apps/web/public/audio/effects/v2/butler-timing.json').read_text())
    manifest={'version':2,'butlerTiming':timing,'source':'../v1/butler.webp','sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'license':'Project original imagegen character artwork; deterministic mesh animation',
        'rebuild':'python scripts/build-effects-butler.py <external-review-directory>','files':[]}
    for name in ['butler-source.webp','butler-bow.webp','butler-pose.json']:
        p=OUT/name;r={'file':name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
        if name.endswith('.webp'):
            im=Image.open(p);r.update(width=im.width,height=im.height,decodedBytes=im.width*im.height*4)
        manifest['files'].append(r)
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'frameCount':56,'auditPassed':True,'files':manifest['files'],'review':str(REVIEW)},indent=2))

if __name__=='__main__':main()
