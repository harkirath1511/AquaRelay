"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useState } from "react";
import { Header, Footer, Icon, Badge } from "./ui";
import { foamPhoto } from "./data";
import { HeroGlobe } from "./hero-globe";
import { FieldScene, Reveal, SignalOrbit, type Habitat } from "./field-visuals";

const habitats: { id: Habitat; title: string; label: string; icon: string; detail: string; examples: string[]; category: string }[] = [
  { id: "water", title: "Follow the water.", label: "Waterways", icon: "water", detail: "A change in colour. A gathering of foam. A bank that looks different. Small details can tell a much bigger story.", examples: ["Water colour", "Litter & foam", "Erosion & flow"], category: "erosion" },
  { id: "land", title: "Look a little closer.", label: "Land & life", icon: "leaf", detail: "From the trees on your street to a nearby habitat, notice the changes that deserve another pair of eyes.", examples: ["Damaged vegetation", "Habitat changes", "Illegal dumping"], category: "habitat_damage" },
  { id: "air", title: "Sense a change.", label: "Air & surroundings", icon: "eye", detail: "Unusual smoke, a persistent odour or a new source of noise. Record what you notice without guessing the cause.", examples: ["Visible smoke", "Unusual odours", "Persistent noise"], category: "air_quality" },
];

const journey = [
  { title: "Notice something.", action: "Observe", icon: "eye", text: "Start with what you can see. A photo, a place and an honest description give the community a question to explore.", label: "An observation opens the question", evidence: "“I noticed foam beside the footbridge.”", note: "Illustrative example · one report, no conclusion" },
  { title: "Add another perspective.", action: "Verify", icon: "camera", text: "A focused verification mission asks for a clearer photo, a comparison or a safe return visit. Every contribution adds context.", label: "A mission fills a specific gap", evidence: "“Is it still there an hour later?”", note: "Illustrative example · useful follow-up evidence" },
  { title: "Connect the evidence.", action: "Understand", icon: "water", text: "An investigation brings the observations together. AI-supported assessment helps show what agrees, what conflicts and what is still unknown.", label: "The shared picture gets clearer", evidence: "Multiple observations. A traceable history.", note: "AI supports assessment; it does not establish a cause" },
  { title: "Give experts a starting point.", action: "Review", icon: "shield", text: "Reviewers can examine the full record, request more evidence and document an outcome. Your small act becomes part of something useful.", label: "People make the final judgement", evidence: "Evidence ready for a closer look.", note: "Expert review is a next step, not a safety guarantee" },
];

export function Landing() {
  const [habitat, setHabitat] = useState<Habitat>("water");
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const selected = habitats.find((item) => item.id === habitat)!;
  const currentStep = journey[step];

  return (
    <div className="aqua-experience" data-motion={paused ? "paused" : "active"}>
      <Header />
      <main id="main" className="field-landing">
        <section className="field-hero" aria-labelledby="field-title">
          <div className="field-hero-copy">
            <div className="field-kicker"><span className="status-pulse" /> A FIELD GUIDE TO COLLECTIVE CARE</div>
            <h1 id="field-title">Small acts.<br />A world of<br /><span className="difference-word">difference<svg viewBox="0 0 520 22" preserveAspectRatio="none" aria-hidden="true"><path d="M5 16C150 0 360 0 512 13" /></svg></span><span className="lime-stop">.</span></h1>
            <p>For the stream you walk past.<br />The trees on your street. The places we share.</p>
            <div className="actions">
              <Link className="button field-primary" href="/report">Make an observation <span className="button-arrow"><Icon name="arrow" size={19} /></span></Link>
              <Link className="field-text-link" href="/explore">Explore the atlas <Icon name="arrow" size={18} /></Link>
            </div>
            <div className="hero-community"><span className="community-symbols" aria-hidden="true"><Icon name="eye" size={17}/><Icon name="leaf" size={17}/><Icon name="water" size={17}/></span><span>One person notices.<br /><strong>The community builds the picture.</strong></span></div>
          </div>
          <div className="atlas-stage" data-habitat={habitat}>
            <div className="atlas-grid" aria-hidden="true" />
            <span className="atlas-corner atlas-corner-top" aria-hidden="true">+</span><span className="atlas-corner atlas-corner-bottom" aria-hidden="true">+</span>
            <div className="atlas-topline"><span><span className="dot" /> THE LIVING ATLAS</span><button className="motion-toggle" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? "Resume animations" : "Pause animations"}>{paused ? "▷" : "Ⅱ"}<span>{paused ? "Play" : "Pause"}</span></button></div>
            <HeroGlobe paused={paused} />
            <div className="atlas-coordinate" aria-hidden="true">LOCAL ATTENTION<br />GLOBAL PERSPECTIVE</div>
            <button className={`atlas-marker marker-water ${habitat === "water" ? "selected" : ""}`} aria-label="Discover waterways" aria-pressed={habitat === "water"} onClick={() => setHabitat("water")}><Icon name="water" size={20} /></button>
            <button className={`atlas-marker marker-land ${habitat === "land" ? "selected" : ""}`} aria-label="Discover land and life" aria-pressed={habitat === "land"} onClick={() => setHabitat("land")}><Icon name="leaf" size={20} /></button>
            <button className={`atlas-marker marker-air ${habitat === "air" ? "selected" : ""}`} aria-label="Discover air and surroundings" aria-pressed={habitat === "air"} onClick={() => setHabitat("air")}><Icon name="eye" size={20} /></button>
            <div className="atlas-field-note" aria-live="polite"><span className="field-note-icon"><Icon name={selected.icon} size={25}/></span><div><span className="field-note-label">START WITH YOUR SURROUNDINGS</span><strong>{selected.title}</strong><a href="#field-guide">Open the field guide <span>↗</span></a></div></div>
            <div className="atlas-bottomline"><span>Illustrative globe · drag to explore</span><span aria-hidden="true">↔</span></div>
          </div>
        </section>

        <div className="field-principles" aria-label="Our approach"><span><Icon name="eye" size={18} /> Notice the unexpected</span><span><Icon name="camera" size={18} /> Share what you see</span><span><Icon name="shield" size={18} /> Keep exact locations private</span><a href="#how-it-works">See how it works <span>↓</span></a></div>

        <section className="field-manifesto">
          <Reveal><div className="section-index">01 / A LITTLE ATTENTION GOES A LONG WAY</div><h2>Nature has a lot to tell us.<br /><span>Let’s get better at listening.</span></h2></Reveal>
          <Reveal className="manifesto-aside"><SignalOrbit /><p>You don’t need all the answers. Just a moment of curiosity, a safe place to stand, and a willingness to look closer.</p></Reveal>
        </section>

        <section id="field-guide" className="habitat-section" aria-labelledby="habitat-heading">
          <div className="habitat-top"><div><div className="section-index">02 / YOUR EVERYDAY ENVIRONMENT</div><h2 id="habitat-heading">Where will you<br /><em>look closer?</em></h2></div><div className="habitat-tabs" aria-label="Choose an environment">{habitats.map((item) => <button key={item.id} aria-pressed={habitat === item.id} onClick={() => setHabitat(item.id)}><Icon name={item.icon} size={19}/>{item.label}<span>↗</span></button>)}</div></div>
          <div className={`habitat-display habitat-${habitat}`}>
            <div className="habitat-illustration"><div className="scene-label"><span className="dot" /> A CLOSER LOOK / {selected.label.toUpperCase()}</div><FieldScene habitat={habitat}/><span className="scene-caption">Every landscape is a shared responsibility.</span></div>
            <div className="habitat-copy" key={habitat}><span className="habitat-number">0{habitats.findIndex((item) => item.id === habitat) + 1}</span><h3>{selected.title}</h3><p>{selected.detail}</p><div className="habitat-examples">{selected.examples.map((example) => <span key={example}>{example}</span>)}</div><Link className="field-text-link" href={`/explore?category=${selected.category}`}>Explore related investigations <Icon name="arrow" size={18}/></Link></div>
          </div>
        </section>

        <section id="how-it-works" className="relay-section" aria-labelledby="relay-heading">
          <Reveal className="relay-heading"><div className="section-index">03 / THE POWER OF A RELAY</div><h2>One observation.<br /><em>Many perspectives.</em></h2><p>See how a small signal becomes a shared understanding.</p></Reveal>
          <div className="relay-workbench">
            <div className="relay-steps" aria-label="Explore the evidence journey">{journey.map((item, index) => <button key={item.action} className={step === index ? "active" : ""} aria-pressed={step === index} onClick={() => setStep(index)}><span className="relay-step-number">0{index + 1}</span><span>{item.action}</span><Icon name="arrow" size={20}/></button>)}</div>
            <div className="relay-detail" aria-live="polite" key={step}>
              <div className={`relay-network relay-network-${step}`} aria-hidden="true"><div className="network-orbit orbit-one"/><div className="network-orbit orbit-two"/><div className="network-center"><Icon name={currentStep.icon} size={42}/></div>{journey.map((item,index)=><span key={item.action} className={`network-node node-${index} ${index <= step ? "connected" : ""}`}><Icon name={item.icon} size={21}/></span>)}<span className="network-label">{currentStep.label}</span></div>
              <div className="relay-detail-copy"><span className="section-index">STEP 0{step + 1}</span><h3>{currentStep.title}</h3><p>{currentStep.text}</p><blockquote>{currentStep.evidence}</blockquote><small>{currentStep.note}</small></div>
            </div>
          </div>
        </section>

        <Reveal className="field-story">
          <div className="field-story-photo"><img src={foamPhoto} alt="Illustrative demo image of foam beside a stream" loading="lazy"/><span className="story-photo-tag">THE FIELD JOURNAL / DEMONSTRATION</span><div className="story-photo-caption"><span>THE MILLBROOK STORY</span><strong>“Is this something<br />to worry about?”</strong></div></div>
          <div className="field-story-copy"><div className="section-index">04 / FOLLOW A REALISTIC EXAMPLE</div><h2>A little foam.<br /><em>A bigger question.</em></h2><p>Maya’s observation at a footbridge started an investigation. A return visit and comparisons helped the community build a clearer picture.</p><Badge status="expert_review_recommended"/><div className="story-evidence-strip"><span><strong>6</strong>demo contributions</span><span><strong>1</strong>shared investigation</span></div><Link className="button field-primary" href="/investigations/demo-foam?mode=demo">Follow the investigation <span className="button-arrow"><Icon name="arrow" size={19}/></span></Link><small>Fictional story and generated image. Includes a duplicate contribution.</small></div>
        </Reveal>

        <section className="field-invitation"><SignalOrbit/><div className="section-index">THE NEXT CHAPTER STARTS WITH YOU</div><h2>A healthier planet.<br /><em>One closer look at a time.</em></h2><p>You don’t have to change the whole world today.<br />Start with your little corner of it.</p><div className="actions"><Link className="button field-primary" href="/report">Make an observation <span className="button-arrow"><Icon name="arrow" size={19}/></span></Link><Link className="field-text-link" href="/missions">Find a verification mission <Icon name="arrow" size={18}/></Link></div><div className="invitation-note"><Icon name="shield" size={16}/> Your safety comes first. Always observe from a safe public place.</div></section>
      </main>
      <Footer />
    </div>
  );
}
