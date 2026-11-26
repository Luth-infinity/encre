from PIL import Image
import numpy as np, cv2, os
src=np.array(Image.open('front_avec.png')).astype(np.float32)
sans=np.array(Image.open('front_sans.png')).astype(np.float32)
H,W=src.shape[:2]
fd=np.load('fdiff.npy')
yy,xx=np.indices((H,W)).astype(np.float32)
ss=lambda e0,e1,v:(lambda u:u*u*(3-2*u))(np.clip((v-e0)/(e1-e0),0,1))
HX,HY,RX,RY=1022,866,490,414
# distance hors de la tête (ellipse)
he=np.zeros((H,W),np.uint8); cv2.ellipse(he,((HX,HY),(2*RX+20,2*RY+20),0),1,-1)
dhead=cv2.distanceTransform(1-he,cv2.DIST_L2,5)
w_head=ss(1330,1180,yy)
w_gG=ss(0,120,dhead)*ss(HX-150,HX-300,xx)*ss(1250,1150,yy)
w_gD=ss(0,120,dhead)*ss(HX+150,HX+300,xx)*ss(1250,1150,yy)
# yeux fermés : sans les ovales, trait courbe
closed=src.copy()
eyes=np.isin(fd,[1,2]); closed[eyes]=sans[eyes]
for cx,cy,w in [(1093,880,150),(835,882,150)]:
    pts=[(cx-w*0.42+j*(w*0.84)/20, cy+10+np.sin(np.pi*j/20)*26) for j in range(21)]
    cv2.polylines(closed,[np.array(pts,np.int32)],False,(200,0,120,255),13,cv2.LINE_AA)
def rot(px,py,ang,w):
    a=-ang*w; c,s=np.cos(a),np.sin(a); dx,dy=xx-px,yy-py
    return px+c*dx-s*dy-xx, py+s*dx+c*dy-yy
def frame(t,T=4.0):
    o=2*np.pi*t/T; S=np.sin
    mx=np.zeros((H,W),np.float32); my=np.zeros((H,W),np.float32)
    for px,py,ang,w in [(HX,1300,0.03*S(o),w_head),
                        (HX-RX+40,HY-60,-0.08*S(3*o),w_gG),
                        (HX+RX-40,HY-60,0.08*S(3*o+0.7),w_gD)]:
        dx,dy=rot(px,py,ang,w); mx+=dx; my+=dy
    # respiration : la tête monte un peu, les bras posés restent
    my+= -(-10*S(2*o))*ss(1650,1250,yy)
    im=closed if ((t+2)%T)<0.13 else src
    return cv2.remap(im,(xx+mx).astype(np.float32),(yy+my).astype(np.float32),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=0)
CX,CY,CR=962,985,729
def bulle(f,px):
    # rond noir de la bulle + anneau d'humeur, Momo par-dessus (il déborde)
    s=px/132*96/2/CR      # 96 px de rond dans 132 px de fenêtre
    M=np.float32([[s,0,px/2-CX*s],[0,s,px/2-CY*s]])
    im=cv2.warpAffine(f,M,(px,px),flags=cv2.INTER_AREA)
    a=im[...,3:]/255.
    yy2,xx2=np.indices((px,px)); d=np.hypot(xx2-px/2+.5,yy2-px/2+.5); R=CR*s
    disc=np.clip(R-d+.5,0,1)[...,None]
    ring=np.clip(R*3/96-np.abs(d-R*(1+7.5/48))+.5,0,1)[...,None]
    base=np.array([245,245,247.])*(1-disc)+np.array([11,12,14.])*disc
    base=base*(1-ring)+np.array([183,166,245.])*ring
    return (im[...,:3]*a+base*(1-a)).astype(np.uint8)
if __name__=='__main__':
    os.makedirs('fr',exist_ok=True); N=96
    for i in range(N):
        f=frame(i/N*4.0)
        big=bulle(f,460); small=bulle(f,132)
        c=np.full((500,740,3),245,np.uint8); c[20:480,20:480]=big; c[184:316,540:672]=small
        cv2.imwrite(f'fr/{i:03d}.png',c[...,::-1])
