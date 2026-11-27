# Détoure les dessins de Nori (même méthode que design/tako) : transparence prise de la version
# sans visage, couleurs de la version avec visage, gris de la bulle retiré (le rond noir et
# l'anneau d'humeur sont dessinés par l'app). Nori a deux yeux : on garde les deux zones.
from PIL import Image
import numpy as np, cv2
def detoure(avec, sans, sortie, avecGris):
    a=np.array(Image.open(avec).convert('RGB')).astype(np.float32)
    s=np.array(Image.open(sans).convert('RGB')).astype(np.float32)
    blanc=np.linalg.norm(s-255,axis=2); gris=np.linalg.norm(s-48,axis=2)
    al=np.clip((blanc-10)/30,0,1)
    if avecGris: al=np.minimum(al,np.clip((gris-8)/22,0,1))
    Image.fromarray(np.dstack([a,al*255]).astype(np.uint8),'RGBA').save(sortie)
    Image.fromarray(np.dstack([s,al*255]).astype(np.uint8),'RGBA').save(sortie.replace('.png','-sans.png'))
    # les yeux : les deux plus grandes zones qui diffèrent (la bouche est la même dans les deux)
    diff=(np.abs(a-s).max(2)>40).astype(np.uint8)
    d=cv2.dilate(diff,np.ones((25,25),np.uint8))
    n,lab,st,_=cv2.connectedComponentsWithStats(d)
    ids=1+np.argsort(-st[1:,cv2.CC_STAT_AREA])[:2]
    oeil=np.isin(lab,ids)&(cv2.dilate(diff,np.ones((9,9),np.uint8))>0)
    np.save(sortie.replace('.png','-oeil.npy'),oeil)
    for i in sorted(ids,key=lambda i:st[i,0]): print(sortie,'œil',*st[i,:4])
detoure('dessin-visage.png','dessin-sans-visage.png','corps.png',False)
detoure('bulle-visage.png','bulle-sans-visage.png','bulle.png',True)
# le rond de la bulle : cercle ajusté sur le bord gris/blanc
s=np.array(Image.open('bulle-sans-visage.png').convert('RGB')).astype(int)
g=(np.abs(s-48).max(2)<12).astype(np.uint8)
g=cv2.morphologyEx(g,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
cs,_=cv2.findContours(g,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
c=max(cs,key=cv2.contourArea)[:,0,:].astype(float)
w=(s[c[:,1].astype(int),np.clip(c[:,0].astype(int)-6,0,None)].min(1)>200)|(s[c[:,1].astype(int),np.clip(c[:,0].astype(int)+6,0,s.shape[1]-1)].min(1)>200)
p=c[w]; A=np.c_[2*p,np.ones(len(p))]; b=(p**2).sum(1)
cx,cy,k=np.linalg.lstsq(A,b,rcond=None)[0]; print('rond',round(cx),round(cy),round(np.sqrt(k+cx*cx+cy*cy)),len(p))
