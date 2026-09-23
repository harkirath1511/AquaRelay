"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Header, Footer, Icon, Badge } from "./ui";
import { naturePhoto, foamPhoto } from "./data";

export function Landing() {
  return (
    <>
      <Header />
      <main id="main">
        <section className="hero">
          <img
            className="hero-photo"
            src={naturePhoto}
            alt="A winding river flowing through a green, forested landscape"
          />
          <div className="hero-shade" />
          <div className="hero-content">
            <div className="eyebrow light">
              <span className="dot" /> FOR THE WATER WE SHARE
            </div>
            <h1>
              Healthy streams
              <br />
              start with
              <br />
              <em>paying attention.</em>
            </h1>
            <p className="tagline">
              One person notices. The community verifies.
              <br />
              Experts can act.
            </p>
            <p className="hero-description">
              Turn what you notice in your local stream into evidence
              <br className="desktop" /> that helps people understand what’s
              happening.
            </p>
            <div className="actions">
              <Link className="button aqua" href="/report">
                Report an observation <Icon name="arrow" />
              </Link>
              <Link className="button translucent" href="/explore">
                Explore investigations <Icon name="arrow" />
              </Link>
            </div>
            <div className="hero-note">
              <Icon name="shield" size={16} /> No expertise needed. Just a safe
              place to look.
            </div>
          </div>
          <div className="hero-caption">
            <span>LOOK CLOSER. UNDERSTAND TOGETHER.</span>
            <span>Water connects us all. ↙</span>
          </div>
          <div className="hero-index">01 / THE BEGINNING</div>
        </section>
        <section className="trust-strip">
          <span>
            <Icon name="eye" /> Community observations
          </span>
          <span>
            <Icon name="shield" /> Evidence, before conclusions
          </span>
          <span>
            <Icon name="pin" /> Your exact location stays private
          </span>
          <span>
            <Icon name="leaf" /> Care for your local waterways
          </span>
        </section>
        <section className="section journey" id="how-it-works">
          <div className="section-heading">
            <div>
              <div className="eyebrow">A SMALL ACT. A SHARED PICTURE.</div>
              <h2>
                From “that looks unusual”
                <br />
                to a clearer understanding.
              </h2>
            </div>
            <p>
              A single photo starts a question, not a conclusion.
              <br />
              Each useful contribution helps us see a little more.
            </p>
          </div>
          <div className="journey-grid">
            {[
              {
                n: "01",
                icon: "eye",
                title: "Notice something",
                text: "Foam, a change in colour, an unusual smell. Share what you see from a safe place.",
              },
              {
                n: "02",
                icon: "camera",
                title: "Build the picture",
                text: "Neighbours add comparisons, return later and help fill specific evidence gaps.",
              },
              {
                n: "03",
                icon: "water",
                title: "Understand the evidence",
                text: "See what the observations support, what conflicts and what remains uncertain.",
              },
              {
                n: "04",
                icon: "leaf",
                title: "Help experts act",
                text: "A clear, traceable evidence record helps reviewers decide what should happen next.",
              },
            ].map((step) => (
              <article key={step.n}>
                <div className="step-top">
                  <span className="icon-disc">
                    <Icon name={step.icon} />
                  </span>
                  <span>{step.n}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="story-section">
          <div className="story-visual">
            <img
              src={foamPhoto}
              alt="Generated demo photograph of foam gathering along a stream edge"
              loading="lazy"
            />
            <span className="photo-label">
              GENERATED DEMO IMAGE · FICTIONAL STORY
            </span>
            <div className="floating-note">
              <div className="avatar">M</div>
              <div>
                <strong>“Is this foam something to worry about?”</strong>
                <p>Maya’s observation started a shared investigation.</p>
              </div>
            </div>
          </div>
          <div className="story-copy">
            <div className="eyebrow">FOLLOW THE EVIDENCE · DEMONSTRATION</div>
            <h2>
              A little foam.
              <br />A bigger question.
            </h2>
            <p>
              Maya noticed white foam near a footbridge. An upstream comparison,
              a downstream confirmation and a return visit helped the community
              build a clearer picture.
            </p>
            <Badge status="expert_review_recommended" />
            <div className="story-facts">
              <span>
                <strong>6</strong> contributions, including a duplicate
              </span>
              <span>
                <strong>1</strong> shared investigation
              </span>
            </div>
            <Link className="text-link" href="/investigations/demo-foam">
              Follow Maya’s investigation <Icon name="arrow" />
            </Link>
          </div>
        </section>
        <section className="section closing">
          <Icon name="water" size={40} />
          <div className="eyebrow">YOU DON’T NEED ALL THE ANSWERS</div>
          <h2>Just a moment of attention.</h2>
          <p>
            A clear upstream photo. A safe return visit. An honest “I’m not
            sure.”
            <br />
            Useful evidence comes in many forms.
          </p>
          <Link className="button" href="/missions">
            Find a verification mission <Icon name="arrow" />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
