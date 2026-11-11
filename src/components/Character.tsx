import { characterImage, poseLabel, type CharacterName, type Pose } from '../characters/slots'

function Character({ name, pose, className = 'character' }: { name: CharacterName; pose: Pose; className?: string }) {
  const image = characterImage(name, pose)

  if (image) return <img className={className} src={image} alt={name} />
  return (
    <span className={`${className} character-placeholder`} role="img" aria-label={name}>
      {name}
      <small>{poseLabel(pose)}</small>
    </span>
  )
}

export default Character
