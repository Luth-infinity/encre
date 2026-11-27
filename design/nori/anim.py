# Nori animée en déformant ses dessins entiers (comme Tako et Momo) : rien n'est découpé.
# La cloche pulse comme une vraie méduse (elle se resserre, se relâche, remonte un peu) et une
# onde descend le long des filaments, plus ample vers leur bout. Boucles de 4 s.
from PIL import Image
import numpy as np, cv2
T=4.0
ss=lambda e0,e1,v:(lambda u:u*u*(3-2*u))(np.clip((v-e0)/(e1-e0),0,1))
def ferme(src,sans,oeil,yeux,ep):
    # yeux fermés : le blanc et son arc partent ; la paupière du bas (la courbe sous le blanc,
    # celle du dessin) est retracée d'un trait net. Un œil fermé en arche, jamais l'œil écrasé.
    f=src.copy()
    blanc=((src[...,:3].min(2)>225)&(src[...,3]>200)&oeil).astype(np.uint8)
    n,lab,st,cen=cv2.connectedComponentsWithStats(blanc)
    k=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*ep+23,2*ep+23))
    m=cv2.dilate(blanc,k)>0
    f[m]=sans[m]
    for cx,cy,inc in yeux:
        i=1+np.argmin(np.hypot(cen[1:,0]-cx,cen[1:,1]-cy)); w=lab==i
        dx,dy=-np.sin(inc),np.cos(inc)                    # vers le bas, dans l'axe de l'œil
        ys,xs=np.where(w)
        bord=~w[np.clip(ys+int(round(dy*4)),0,w.shape[0]-1),np.clip(xs+int(round(dx*4)),0,w.shape[1]-1)]
        ys,xs=ys[bord],xs[bord]
        u=(xs-cx)*np.cos(inc)+(ys-cy)*np.sin(inc)
        o=np.argsort(u); u,xs,ys=u[o],xs[o],ys[o]
        lo,hi=u[0]+0.04*(u[-1]-u[0]),u[-1]-0.04*(u[-1]-u[0])
        pts=[]
        for c in np.linspace(lo,hi,24):
            s=np.abs(u-c)<6
            if s.any(): pts.append((xs[s].mean()+dx*ep*0.5, ys[s].mean()+dy*ep*0.5))
        pts=cv2.GaussianBlur(np.array(pts,np.float32).reshape(-1,1,2),(1,5),0).reshape(-1,2)
        cv2.polylines(f,[np.round(pts*8).astype(np.int32)],False,(128,146,250,255),ep,cv2.LINE_AA,shift=3)
    return f
def rot(xx,yy,px,py,ang,w):
    a=-ang*w; c,s=np.cos(a),np.sin(a); dx,dy=xx-px,yy-py
    return px+c*dx-s*dy-xx, py+s*dx+c*dy-yy
def cloche(H,W,centre,axes,ang,bas,fondu):
    # la cloche : une ellipse coupée sous la ligne de son bord (sinon elle prend les filaments)
    m=np.zeros((H,W),np.uint8); cv2.ellipse(m,(centre,axes,ang),1,-1)
    (x0,y0),(x1,y1)=bas; yy,xx=np.indices((H,W))
    m&=((yy-y0)*(x1-x0)-(xx-x0)*(y1-y0)<0).astype(np.uint8)
    return ss(fondu,0,cv2.distanceTransform(1-m,cv2.DIST_L2,5)), m

class Nori:
    def __init__(s,nom,yeux,ep,centre,axes,ang,bas,fondu,ampl,pouls,bob):
        s.src=np.array(Image.open(f'{nom}.png')).astype(np.float32)
        sans=np.array(Image.open(f'{nom}-sans.png')).astype(np.float32)
        s.H,s.W=s.src.shape[:2]
        s.closed=ferme(s.src,sans,np.load(f'{nom}-oeil.npy'),yeux,ep)
        yy,xx=np.indices((s.H,s.W)).astype(np.float32); s.xx,s.yy=xx,yy
        s.wc,m=cloche(s.H,s.W,centre,axes,ang,bas,fondu)
        s.C=centre
        # distance à la cloche : c'est le long des filaments que l'onde descend
        s.r=cv2.distanceTransform(1-m,cv2.DIST_L2,5)
        s.ampl,s.pouls,s.bob=ampl,pouls,bob
    cligne=1.0
    def frame(s,t):
        o=2*np.pi*t/T; S=np.sin; xx,yy=s.xx,s.yy; wc=s.wc; wf=1-wc
        # filaments : onde qui descend, décalée selon la position du filament
        A=s.ampl*wf*np.clip(s.r/900,0,1.4)**1.3
        mx=A*(S(s.r/620*2*np.pi-o+xx/260)+0.3*S(s.r/280*2*np.pi-2*o+xx/150+1))
        my=np.zeros_like(mx)
        # cloche : se resserre et s'allonge un peu, puis se relâche (deux pulsations par boucle)
        p=S(2*o)
        mx+=(xx-s.C[0])*(-s.pouls*p)*wc
        my+=(yy-s.C[1])*(s.pouls*0.6*p)*wc
        dx,dy=rot(xx,yy,s.C[0],s.C[1]+300,0.025*S(o),wc); mx+=dx; my+=dy
        # tout remonte quand la cloche pousse, les bouts suivent avec du retard
        my+=-s.bob*(wc*S(2*o+0.4)+wf*S(2*o-0.6))
        im=s.closed if ((t+s.cligne)%T)<0.14 else s.src
        return cv2.remap(im,(xx-mx).astype(np.float32),(yy-my).astype(np.float32),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=0)

def Corps():
    """Nori en entière (coin de l'accueil)."""
    n=Nori('corps',[(1410,470,0.15),(1630,560,0.55)],10,
           (1500,500),(1080,780),18,((1060,730),(1990,905)),140,30,0.022,10)
    n.cligne=2; return n
class Bulle(Nori):
    """Nori de trois-quarts dans la bulle : la cloche déborde à droite, les filaments en bas."""
    CX,CY,CR=1092,927,813
    def __init__(s):
        super().__init__('bulle',[(1170,680,0.35),(1560,890,0.7)],14,
                         (1330,780),(1600,1040),22,((620,1030),(2010,1355)),150,16,0.018,12)
