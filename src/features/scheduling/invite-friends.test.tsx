import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { InviteFriends } from "./host-flow"

describe("invitation controls", () => {
  it("names each participant action and keeps host removal unavailable", () => {
    const markup = renderToStaticMarkup(createElement(InviteFriends, {
      people: [
        { name: "You", email: "host@warmly.test", initials: "YO", status: "host" },
        { name: "Sam", email: "sam@warmly.test", initials: "SA", status: "ready" },
        { name: "Maya", email: "maya@warmly.test", initials: "MA", status: "invited", invitationId: "invite-maya" },
        { name: "Theo", email: "theo@warmly.test", initials: "TH", status: "invited", invitationId: "invite-theo", inviteUrl: "https://warmly.test/invite/fixture-only-not-a-real-invitation" },
      ],
      onPeopleChange: () => {},
      onBack: () => {},
      onContinue: () => {},
      onRemove: () => {},
      onReissue: () => {},
      showRecent: false,
    }))
    expect(markup).toContain('aria-label="Friend’s email address"')
    expect(markup).toContain('aria-label="Remove Sam"')
    expect(markup).toContain('aria-label="Remove Maya"')
    expect(markup).toContain('aria-label="New invitation link for Maya"')
    expect(markup).toContain('aria-label="Copy invitation for Theo"')
    expect(markup).not.toContain('aria-label="Remove You"')
    expect(markup).not.toContain('aria-label="New invitation link for Theo"')
  })
})
