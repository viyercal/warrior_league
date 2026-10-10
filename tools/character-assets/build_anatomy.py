"""Build game-space anatomical meshes from CC0 MakeHuman data, no upstream code.

Only graphical data is used. See LICENSE.ASSETS.md and provenance.json.
The build is deterministic and produces synchronously importable mesh data.
"""
import collections
import json
import math
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent.parent / 'src/art/anatomy'
OUT.mkdir(exist_ok=True)
vertices, texcoords, faces = [], [], []
groups = collections.defaultdict(set)
group = ''
for line in (ROOT / 'base.obj').read_text().splitlines():
    fields = line.split()
    if not fields:
        continue
    if fields[0] == 'v':
        vertices.append([float(v) for v in fields[1:4]])
    elif fields[0] == 'vt':
        texcoords.append([float(v) for v in fields[1:3]])
    elif fields[0] == 'g':
        group = fields[1]
    elif fields[0] == 'f':
        face = [tuple(int(x) - 1 for x in f.split('/')[:2]) for f in fields[1:]]
        groups[group].update(v for v, uv in face)
        if group == 'body':
            faces.append(face)
base = np.array(vertices)
weights = json.loads((ROOT / 'rigs/default_weights.mhw').read_text())['weights']
eye_uv, eye_faces, eye_refs, eye_scale = [], [], [], {}
for line in (ROOT / 'eyes/high-poly/high-poly.obj').read_text().splitlines():
    f = line.split()
    if f and f[0] == 'vt': eye_uv.append(list(map(float, f[1:3])))
    if f and f[0] == 'f': eye_faces.append([tuple(int(n)-1 for n in p.split('/')[:2]) for p in f[1:]])
reading_eyes = False
for line in (ROOT / 'eyes/high-poly/high-poly.mhclo').read_text().splitlines():
    f = line.split()
    if not f or f[0].startswith('#'): continue
    if f[0] in ['x_scale','y_scale','z_scale']: eye_scale['xyz'.index(f[0][0])] = [int(f[1]),int(f[2]),float(f[3])]
    if f[0] == 'verts': reading_eyes = True; continue
    if reading_eyes and len(f) == 9: eye_refs.append((list(map(int,f[:3])),np.array(list(map(float,f[3:6]))),np.array(list(map(float,f[6:9])))))

def morph(name, targets):
    result = base.copy()
    for target, influence in targets:
        for line in (ROOT / 'targets' / (target + '.target')).read_text().splitlines():
            if not line or line.startswith('#'):
                continue
            i, x, y, z = line.split()
            result[int(i)] += np.array([float(x), float(y), float(z)]) * influence
    return result

def align_down(direction):
    a = direction / np.linalg.norm(direction)
    b = np.array([0., -1., 0.])
    v = np.cross(a, b)
    c = np.dot(a, b)
    if c > .999999:
        return np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx / (1 + c)

profiles = {
    'caelan': dict(height=2.02, width=1.06, depth=1.04, targets=[
        ('macrodetails/caucasian-male-young', 1),
        ('macrodetails/universal-male-young-maxmuscle-averageweight', .65),
        ('head/head-age-incr', .3), ('head/head-square', .18)]),
    'nyra': dict(height=1.76, width=1, depth=1, targets=[
        ('macrodetails/african-female-young', 1),
        ('macrodetails/universal-female-young-maxmuscle-minweight', .45)]),
    'serai': dict(height=2.00, width=.94, depth=1, targets=[
        ('macrodetails/african-female-young', .7),
        ('macrodetails/african-female-old', .3),
        ('head/head-age-incr', .2), ('head/head-oval', .25)]),
}

for name, profile in profiles.items():
    vs = morph(name, profile['targets'])
    def joint(n):
        return vs[list(groups['joint-' + n])].mean(axis=0)
    body_indices = list(groups['body'])
    scale = profile['height'] / np.ptp(vs[body_indices, 1])
    stretch = np.array([scale * profile['width'], scale, scale * profile['depth']])
    hip = joint('pelvis')
    src = [hip, hip, joint('head')]
    dst = [np.zeros(3), np.zeros(3), (src[2] - hip) * stretch]
    matrices = [np.eye(3)] * 3
    for side in ['r', 'l']:
        shoulder, elbow, hand = [joint(side + '-' + n) for n in ['shoulder', 'elbow', 'hand']]
        shoulder_target = (shoulder - hip) * stretch
        upper_length = np.linalg.norm((elbow - shoulder) * stretch)
        fore_length = np.linalg.norm((hand - elbow) * stretch)
        elbow_target = shoulder_target + [0, -upper_length, 0]
        hand_target = elbow_target + [0, -fore_length, 0]
        src += [shoulder, elbow, hand]
        dst += [shoulder_target, elbow_target, hand_target]
        matrices += [align_down((elbow - shoulder) * stretch), align_down((hand - elbow) * stretch), align_down((hand - elbow) * stretch)]
    for side in ['r', 'l']:
        upper, knee, ankle = [joint(side + '-' + n) for n in ['upper-leg', 'knee', 'ankle']]
        upper_target = (upper - hip) * stretch
        knee_target = upper_target + [0, -np.linalg.norm((knee - upper) * stretch), 0]
        src += [upper, knee]
        dst += [upper_target, knee_target]
        matrices += [align_down((knee - upper) * stretch), align_down((ankle - knee) * stretch)]
    vw = [collections.defaultdict(float) for v in vs]
    for bone, items in weights.items():
        side = 0 if bone.endswith('.R') else 1
        if bone.startswith('upperarm'):
            index = 3 + side * 3
        elif bone.startswith('lowerarm'):
            index = 4 + side * 3
        elif bone.startswith(('hand', 'finger', 'metacarpal', 'wrist')):
            index = 5 + side * 3
        elif bone.startswith('upperleg'):
            index = 9 + side * 2
        elif bone.startswith(('lowerleg', 'foot', 'toe')):
            index = 10 + side * 2
        elif bone.startswith(('spine', 'breast', 'clavicle', 'shoulder', 'neck')):
            index = 1
        elif bone.startswith(('root', 'pelvis')):
            index = 0
        else:
            index = 2
        for i, w in items:
            vw[i][index] += w
    posed, ids, ws = [], [], []
    for i, v in enumerate(vs):
        items = sorted(vw[i].items(), key=lambda x: -x[1])[:4] or [(0, 1)]
        total = sum(w for b, w in items)
        pairs = [(b, w / total) for b, w in items]
        p = sum((matrices[b] @ ((v - src[b]) * stretch) + dst[b]) * w for b, w in pairs)
        posed.append(p)
        ids.append([b for b, w in pairs] + [0] * (4 - len(pairs)))
        ws.append([w for b, w in pairs] + [0] * (4 - len(pairs)))
    posed = np.array(posed)
    # Close the weapon hands around a cylindrical grip. Serai's free hand
    # stays open for her casting gesture. The palm and wrist retain anatomy.
    for hand in [5, 8]:
        if name == 'serai' and hand == 5:
            continue
        length = .21 if name == 'caelan' else .17 if name == 'nyra' else .19
        for i in body_indices:
            influence = vw[i].get(hand, 0)
            local = posed[i] - dst[hand]
            if influence > .75 and local[1] < -length * .4:
                t = min(1, (-local[1] / length - .4) / .6)
                posed[i, 1] = dst[hand][1] - length * .4 - length * .30 * math.sin(t * math.pi * .94)
                posed[i, 2] += length * .27 * (1 - math.cos(t * math.pi * .94))
    hip_height = -posed[body_indices, 1].min()
    head_indices = [i for i in body_indices if vw[i].get(2, 0) > .8]
    eyes = [((joint(side + '-eye') - hip) * stretch - dst[2]).tolist() for side in ['r', 'l']]
    # Indexed geometry retains shared vertices for smooth anatomical normals.
    positions, uv, skin_ids, skin_weights, index, mat = [], [], [], [], [], []
    lookup = {}
    for face in faces:
        centroid = np.mean([posed[i] for i, t in face], axis=0)
        head_weight = sum(vw[i].get(2, 0) for i, t in face) / len(face)
        hand_weight = sum(vw[i].get(5, 0) + vw[i].get(8, 0) for i, t in face) / len(face)
        # Head has its own projected, baked portrait texture. Hands and neck
        # retain skin; all covered anatomy is an opaque fitted undergarment.
        material = 2 if head_weight > .6 else (3 if name != 'serai' else 1) if hand_weight > .5 else 1 if centroid[1] > dst[2][1] - .115 else 0
        if name == 'nyra':
            arm_weight = sum(vw[i].get(3, 0) + vw[i].get(6, 0) for i, t in face) / len(face)
            if arm_weight > .75 and dst[4][1]+.025 < centroid[1] < dst[3][1]-.095:
                material = 1
        corners = []
        for i, t in face:
            key = (i, t)
            if key not in lookup:
                lookup[key] = len(positions) // 3
                positions.extend(posed[i].tolist())
                uv.extend(texcoords[t])
                skin_ids.extend(ids[i]); skin_weights.extend(ws[i])
            corners.append(lookup[key])
        for n in range(1, len(face) - 1):
            index.extend([corners[0], corners[n], corners[n + 1]])
            mat.append(material)
    def rounded(values):
        return np.round(values, 6).tolist()
    # Store the head landmarks, not a hardcoded cartoon face layout.
    head_local = posed[head_indices] - dst[2]
    factors = np.array([abs(vs[eye_scale[k][0],k]-vs[eye_scale[k][1],k])/eye_scale[k][2] for k in range(3)])
    eye_positions = [((sum(vs[i]*w for i,w in zip(ref,weights)) + offset*factors - src[2])*stretch).tolist() for ref,weights,offset in eye_refs]
    eye_pos, eye_tex, eye_index, eye_lookup = [], [], [], {}
    for face in eye_faces:
        # The atlas' blue corner is a separate corneal helper surface. The
        # opaque iris/sclera supplies the eye; do not render that helper opaque.
        center_uv = np.mean([eye_uv[t] for i,t in face],axis=0)
        if center_uv[0] > .86 and center_uv[1] < .17:
            continue
        corners=[]
        for i,t in face:
            if (i,t) not in eye_lookup:
                eye_lookup[(i,t)] = len(eye_pos)//3
                eye_pos.extend(eye_positions[i]); eye_tex.extend(eye_uv[t])
            corners.append(eye_lookup[(i,t)])
        for n in range(1,len(face)-1): eye_index.extend([corners[0],corners[n],corners[n+1]])
    data = dict(name=name, height=profile['height'], hipHeight=round(float(hip_height), 6),
        joints=rounded(dst), eyes=eyes, eyeMesh=dict(position=rounded(eye_pos),uv=rounded(eye_tex),index=eye_index), headBounds=rounded([head_local.min(axis=0), head_local.max(axis=0)]),
        position=rounded(positions), uv=rounded(uv), skinIndex=skin_ids, skinWeight=rounded(skin_weights), index=index, material=mat)
    (OUT / (name + '.json')).write_text(json.dumps(data, separators=(',', ':')))
    print(name, 'vertices',len(positions)//3,'triangles',len(index)//3,'hip',round(hip_height,3),'head',data['headBounds'],'eyes',eyes)

provenance = {'source':'https://github.com/makehumancommunity/makehuman',
    'commit':json.loads((ROOT / 'upstream-tree.json').read_text())['commit'],
    'license':'CC0-1.0 (graphical assets only)', 'profiles':profiles,
    'builder':'tools/character-assets/build_anatomy.py', 'outputs':'src/art/anatomy/*.json'}
(ROOT / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
