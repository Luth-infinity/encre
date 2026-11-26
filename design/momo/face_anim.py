import numpy as np, cv2, sys
from PIL import Image
sys.argv=['x','1','18']
exec(open('face_on.py').read().split("out=np.zeros_like(cut)")[0])   # réutilise tete, vis, br, brG
import bulle
# corps
corps=np.zeros_like(cut); BX,BY,BA,BB=CX,CY+430,290,330
cv2.ellipse(corps,((BX,BY),(2*BA,2*BB),0),(55,12,38,255),-1,cv2.LINE_AA)
cv2.ellipse(corps,((BX,BY+40),(2*BA*0.55,2*BB*0.85),0),(72,16,48,255),-1,cv2.LINE_AA)
cv2.ellipse(corps,((BX,BY),(2*BA,2*BB),0),(200,0,120,255),11,cv2.LINE_AA)
# visage yeux fermés : ovales effacés, trait courbe
def feat(ids):
    m=cv2.dilate(np.isin(flab,ids).astype(np.uint8),np.ones((5,5),np.uint8))>0
    return cv2.warpAffine(lvl(take(cut1,m)),np.float32([[1,0,CX-fx],[0,1,CY+15-fy]]),(W,H))
yeux=feat([1,2]); vis_f=feat([3,4,5])
n,lab,st,cen=cv2.connectedComponentsWithStats((yeux[...,3]>20).astype(np.uint8))
for i in range(1,n):
    x,y,w,h,a=st[i]
    if a<500: continue
    cx,cy=x+w/2,y+h/2
    pts=[(cx-w*0.42+j*(w*0.84)/20, cy+8+np.sin(np.pi*j/20)*20) for j in range(21)]
    cv2.polylines(vis_f,[np.array(pts,np.int32)],False,(200,0,120,255),11,cv2.LINE_AA)
def aff(im,deg,c,extra=None):
    M=cv2.getRotationMatrix2D(c,deg,1)
    if extra is not None: M=np.vstack([extra,[0,0,1]])[:2] if False else (np.vstack([M,[0,0,1]])@np.vstack([extra,[0,0,1]]))[:2]
    return cv2.warpAffine(im,M,(W,H),flags=cv2.INTER_LINEAR)
def frame(t,T=4.0):
    o=2*np.pi*t/T; S=np.sin
    b=S(2*o); fy=BY+BB
    Mb=np.float32([[1-0.006*b,0,BX*0.006*b],[0,1+0.012*b,-fy*0.012*b]])
    lift=-fy*0  # la tête suit la respiration
    dy=(CY+AY-fy)*0.012*b
    Mh=np.float32([[1,0,0],[0,1,dy]])
    tilt=np.degrees(0.03*S(o))
    neck=(CX,CY+AY)
    out=np.zeros_like(cut)
    out=over(out,cv2.warpAffine(corps,Mb,(W,H)))
    gD=aff(br, np.degrees(0.07*S(3*o)), (CX+AX-30,CY+10))
    gG=aff(brG,-np.degrees(0.07*S(3*o+0.6)),(CX-AX+30,CY+10))
    blink=((t+2)%T)<0.13
    for l in (gD,gG,tete,vis_f if blink else vis):
        out=over(out,aff(l,tilt,neck,Mh))
    return out
if __name__=='__main__':
    import os; os.makedirs('ff',exist_ok=True)
    cx,cy,r=CX,CY+40,505
    N=96
    for i in range(N):
        f=frame(i/N*4.0)
        big=Image.fromarray(bulle.bulle(f,cx,cy,r,440)); small=Image.fromarray(bulle.bulle(f,cx,cy,r,132))
        c=Image.new('RGBA',(720,480),(245,245,247,255)); c.alpha_composite(big,(20,20)); c.alpha_composite(small,(530,174))
        c.convert('RGB').save(f'ff/{i:03d}.png')
