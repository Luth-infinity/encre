from PIL import Image
import numpy as np, cv2, sys
src=np.array(Image.open('cut1.png')).astype(np.float32)
H,W=src.shape[:2]
lab=np.load('lab.npy'); flab=np.load('facelab.npy')
yy,xx=np.indices((H,W)).astype(np.float32)
ss=lambda e0,e1,v: (lambda u: u*u*(3-2*u))(np.clip((v-e0)/(e1-e0),0,1))
# body (without arms) and head masks -> distance outside
body=(lab==34).astype(np.uint8)
poly=np.array([[1690,800],[1830,760],[2080,860],[2080,1020],[1990,1000],[1760,935],[1700,900]],np.int32)
pm=np.zeros((H,W),np.uint8); cv2.fillPoly(pm,[poly],1)
body[(pm>0)]=0
body=cv2.morphologyEx(body,cv2.MORPH_CLOSE,np.ones((25,25),np.uint8))
body=cv2.dilate(body,np.ones((11,11),np.uint8))
dbody=cv2.distanceTransform(1-body,cv2.DIST_L2,5)
head=cv2.dilate((lab==9).astype(np.uint8),np.ones((13,13),np.uint8))
dhead=cv2.distanceTransform(1-head,cv2.DIST_L2,5)
# weights (fixed)
w_head=ss(870,690,yy)
w_gG=ss(0,110,dhead)*ss(1260,1180,xx)*ss(880,820,yy)
w_gD=ss(0,110,dhead)*ss(1560,1640,xx)*ss(580,520,yy)
w_brG=ss(0,110,dbody)*ss(1400,1340,xx)*ss(900,950,yy)*ss(1260,1210,yy)
w_brD=ss(0,110,dbody)*ss(1760,1820,xx)*ss(720,770,yy)*ss(1080,1040,yy)
w_tail=ss(1360,940,xx)*ss(1100,1200,yy)
# eyes closed version of the source
closed=src.copy()
eyes=np.isin(flab,[1,2]); eyes=cv2.dilate(eyes.astype(np.uint8),np.ones((5,5),np.uint8))>0
closed[eyes,:3]=(54,11,37)
for cx,cy,w in [(1287,575,68),(1440,532,69)]:
    pts=[(cx-w*0.42+i*(w*0.84)/20, cy+8+np.sin(np.pi*i/20)*20) for i in range(21)]
    cv2.polylines(closed,[np.array(pts,np.int32)],False,(200,0,120,255),11,cv2.LINE_AA)
def rot(px,py,ang,w):
    # backward map: displacement of rotating by ang around (px,py), weighted
    a=-ang*w; c,s=np.cos(a),np.sin(a)
    dx,dy=xx-px,yy-py
    return px+c*dx-s*dy-xx, py+s*dx+c*dy-yy
def frame(t, T=4.0):
    o=2*np.pi*t/T; S=np.sin
    mx=np.zeros((H,W),np.float32); my=np.zeros((H,W),np.float32)
    for (px,py,ang,w) in [
        (1420,790, 0.035*S(o), w_head),
        (1120,560, 0.07*S(3*o), w_gG),
        (1650,410,-0.07*S(3*o+0.8), w_gD),
        (1360,960, 0.07*S(2*o+1), w_brG),
        (1770,880, 0.06*S(2*o), w_brD),
        (1440,1480, 0.07*S(2*o+0.5), w_tail)]:
        dx,dy=rot(px,py,ang,w); mx+=dx; my+=dy
    X=xx+mx; Y=yy+my
    # breathing around the feet
    b=S(2*o); fx,fy=1750,1765
    X=fx+(X-fx)/(1-0.006*b); Y=fy+(Y-fy)/(1+0.012*b)
    blink=((t+2)%T)<0.13
    im=closed if blink else src
    return cv2.remap(im,X.astype(np.float32),Y.astype(np.float32),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=0)
if __name__=='__main__':
    import os; os.makedirs('frames',exist_ok=True)
    N=96
    for i in range(N):
        f=frame(i/N*4.0)
        f=cv2.resize(f,(W//2,H//2),interpolation=cv2.INTER_AREA)
        a=f[...,3:]/255.0
        L=f[...,:3]*a+255*(1-a); D=f[...,:3]*a+np.array([34,27,27])*(1-a)
        crop=lambda im: im[40:910,300:1060]
        out=np.concatenate([crop(L),crop(D)],1).astype(np.uint8)
        cv2.imwrite(f'frames/{i:03d}.png',out[...,::-1])
