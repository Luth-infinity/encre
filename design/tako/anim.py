# Tako animé en déformant ses dessins entiers (comme Momo, design/momo) : rien n'est découpé,
# donc aucun contour ne se voit à travers le corps. Boucles de 4 s.
from PIL import Image
import numpy as np, cv2
T=4.0
LAV=(180,94,255,255)
ss=lambda e0,e1,v:(lambda u:u*u*(3-2*u))(np.clip((v-e0)/(e1-e0),0,1))
def ferme(src,sans,oeil,cx,cy,w,inc,ep):
    # œil fermé : l'ovale disparaît, un trait courbe le remplace (jamais l'ovale écrasé)
    f=src.copy(); m=cv2.dilate(oeil.astype(np.uint8),np.ones((7,7),np.uint8))>0
    f[m]=sans[m]
    c,s=np.cos(inc),np.sin(inc); pts=[]
    for j in range(21):
        u=-0.5+j/20; x=u*w; y=np.sin(np.pi*j/20)*w*0.22
        pts.append((cx+c*x-s*y, cy+s*x+c*y))
    cv2.polylines(f,[np.array(pts,np.int32)],False,LAV,ep,cv2.LINE_AA)
    return f
def rot(xx,yy,px,py,ang,w):
    a=-ang*w; c,s=np.cos(a),np.sin(a); dx,dy=xx-px,yy-py
    return px+c*dx-s*dy-xx, py+s*dx+c*dy-yy

class Corps:
    """Tako en entier (coin de l'accueil)."""
    def __init__(s):
        s.src=np.array(Image.open('corps.png')).astype(np.float32)
        sans=np.array(Image.open('corps-sans.png')).astype(np.float32)
        s.H,s.W=s.src.shape[:2]
        s.closed=ferme(s.src,sans,np.load('corps-oeil.npy'),1390,692,80,0.42,10)
        yy,xx=np.indices((s.H,s.W)).astype(np.float32); s.xx,s.yy=xx,yy
        # tête : ellipse penchée ; les bras partent de O, sous la tête
        he=np.zeros((s.H,s.W),np.uint8); cv2.ellipse(he,((1440,560),(560,760),-35),1,-1)
        s.wtete=ss(130,0,cv2.distanceTransform(1-he,cv2.DIST_L2,5))
        s.O=(1235,890)
        dx,dy=xx-s.O[0],yy-s.O[1]; s.r=np.hypot(dx,dy); s.th=np.arctan2(dy,dx)
        s.tx,s.ty=-dy/np.maximum(s.r,1),dx/np.maximum(s.r,1)
        s.wbras=ss(120,520,s.r)*(1-s.wtete)
    def frame(s,t):
        o=2*np.pi*t/T; S=np.sin; xx,yy=s.xx,s.yy
        # onde qui part de la base et court vers le bout des bras, chaque bras décalé
        A=34*s.wbras*(s.r/800)**1.2
        d=A*(S(s.r/640*2*np.pi-o+2*s.th)+0.35*S(s.r/300*2*np.pi-2*o+3*s.th+1))
        mx=d*s.tx; my=d*s.ty
        # la tête se balance doucement autour de la base des bras, et respire
        dx,dy=rot(xx,yy,*s.O,0.035*S(o),s.wtete); mx+=dx; my+=dy
        k=0.018*S(2*o)*s.wtete; mx+=(xx-s.O[0])*k*0.5; my+=(yy-s.O[1])*k
        im=s.closed if ((t+2)%T)<0.14 else s.src
        return cv2.remap(im,(xx-mx).astype(np.float32),(yy-my).astype(np.float32),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=0)

class Bulle:
    """Tako de trois-quarts dans la bulle : le bas reste calé sur le rond, il déborde en bas à gauche."""
    CX,CY,CR=1087,921,807
    def __init__(s):
        s.src=np.array(Image.open('bulle.png')).astype(np.float32)
        sans=np.array(Image.open('bulle-sans.png')).astype(np.float32)
        s.H,s.W=s.src.shape[:2]
        s.closed=ferme(s.src,sans,np.load('bulle-oeil.npy'),1484,1020,240,0.34,16)
        yy,xx=np.indices((s.H,s.W)).astype(np.float32); s.xx,s.yy=xx,yy
        s.wtete=ss(1660,1200,yy)
        s.wbout=ss(1580,1700,yy)*ss(1180,980,xx)
    def frame(s,t):
        o=2*np.pi*t/T; S=np.sin; xx,yy=s.xx,s.yy
        mx,my=rot(xx,yy,1150,1700,0.035*S(o),s.wtete)
        my+=-14*S(2*o+0.6)*s.wtete            # respiration : la tête monte un peu
        dx,dy=rot(xx,yy,1080,1690,0.10*S(2*o+1.2),s.wbout); mx+=dx; my+=dy   # le bout de bras frétille
        im=s.closed if ((t+1)%T)<0.14 else s.src
        return cv2.remap(im,(xx+mx).astype(np.float32),(yy+my).astype(np.float32),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=0)
